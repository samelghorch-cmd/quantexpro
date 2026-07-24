//+------------------------------------------------------------------+
//|                                          QuantEXProBridge.mq5     |
//|   Pont d'exécution QuantEXPro <-> MetaTrader 5                    |
//|                                                                  |
//|   L'EA POLL les signaux en attente sur l'API backend, les        |
//|   exécute, puis renvoie un ACK d'exécution (ticket + prix).      |
//|   Aucun flux entrant vers le VPS : tout part de l'EA (HTTPS).    |
//|                                                                  |
//|   Prérequis : autoriser l'URL de l'API dans                     |
//|   Outils > Options > Expert Advisors > "Autoriser WebRequest".  |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"

#include <Trade/Trade.mqh>

input string ApiBaseUrl   = "https://quantexpro.onrender.com"; // Base API (sans / final)
input string ApiKey       = "";                                // Clé d'API rôle EA (X-API-Key)
input string TradeMode    = "demo";                            // paper | demo | live
input int    PollSeconds  = 5;                                 // Fréquence de poll
input int    MagicNumber  = 770001;                            // Magic unique QuantEXPro
input int    MaxSlippage  = 20;                                // Slippage max (points)
input int    HttpTimeout  = 5000;                              // Timeout WebRequest (ms)

CTrade trade;

//+------------------------------------------------------------------+
int OnInit()
  {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(MaxSlippage);
   if(ApiKey=="")
      Print("QuantEXProBridge: ATTENTION — ApiKey vide (le backend refusera l'accès en production).");
   EventSetTimer(MathMax(1,PollSeconds));
   Print("QuantEXProBridge initialisé — mode=",TradeMode," poll=",PollSeconds,"s");
   return(INIT_SUCCEEDED);
  }
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   EventKillTimer();
  }
//+------------------------------------------------------------------+
void OnTimer()
  {
   PollAndExecute();
  }
//+------------------------------------------------------------------+
//| Effectue une requête HTTP et renvoie le corps de réponse.        |
//+------------------------------------------------------------------+
bool HttpRequest(const string method,const string url,const string body,string &response)
  {
   char post[];
   char result[];
   string headers="X-API-Key: "+ApiKey+"\r\nContent-Type: application/json\r\n";
   if(body!="")
      StringToCharArray(body,post,0,StringLen(body),CP_UTF8);
   ResetLastError();
   string result_headers;
   int status=WebRequest(method,url,headers,HttpTimeout,post,result,result_headers);
   if(status==-1)
     {
      Print("WebRequest échec (",GetLastError(),") — URL autorisée dans les options ? ",url);
      return(false);
     }
   response=CharArrayToString(result,0,WHOLE_ARRAY,CP_UTF8);
   if(status<200 || status>=300)
     {
      Print("HTTP ",status," sur ",url," : ",response);
      return(false);
     }
   return(true);
  }
//+------------------------------------------------------------------+
//| Récupère les signaux en attente et les exécute.                  |
//+------------------------------------------------------------------+
void PollAndExecute()
  {
   string url=ApiBaseUrl+"/v1/mt5/signals/pending?mode="+TradeMode+"&limit=50";
   string resp="";
   if(!HttpRequest("GET",url,"",resp))
      return;
   if(StringLen(resp)<2 || StringFind(resp,"client_order_id")<0)
      return; // tableau vide

   int pos=0;
   while(true)
     {
      int start=StringFind(resp,"{",pos);
      if(start<0) break;
      int end=StringFind(resp,"}",start);
      if(end<0) break;
      string obj=StringSubstr(resp,start,end-start+1);
      ExecuteSignal(obj);
      pos=end+1;
     }
  }
//+------------------------------------------------------------------+
//| Exécute un signal (objet JSON) et renvoie l'ACK au backend.      |
//+------------------------------------------------------------------+
void ExecuteSignal(const string obj)
  {
   string coid  = JsonStr(obj,"client_order_id");
   string sym   = JsonStr(obj,"symbol");
   string side  = JsonStr(obj,"side");
   string otype = JsonStr(obj,"order_type");
   double vol   = JsonNum(obj,"volume");
   double price = JsonNum(obj,"price");
   double sl    = JsonNum(obj,"sl");
   double tp    = JsonNum(obj,"tp");

   if(coid=="" || sym=="")
      return;
   if(!SymbolSelect(sym,true))
     {
      SendAck(coid,"rejected",0,0.0,"symbole indisponible");
      return;
     }

   bool ok=false;
   string reason="";
   if(side=="close")
     {
      ok=trade.PositionClose(sym);
      if(!ok) reason=trade.ResultRetcodeDescription();
     }
   else
     {
      double lots=NormalizeDouble(vol,2);
      double slN=(sl>0? NormalizeDouble(sl,(int)SymbolInfoInteger(sym,SYMBOL_DIGITS)):0.0);
      double tpN=(tp>0? NormalizeDouble(tp,(int)SymbolInfoInteger(sym,SYMBOL_DIGITS)):0.0);
      if(side=="buy")
         ok=trade.Buy(lots,sym,0.0,slN,tpN,"QX:"+coid);
      else if(side=="sell")
         ok=trade.Sell(lots,sym,0.0,slN,tpN,"QX:"+coid);
      else
        {
         SendAck(coid,"rejected",0,0.0,"side inconnu: "+side);
         return;
        }
      if(!ok) reason=trade.ResultRetcodeDescription();
     }

   if(ok)
     {
      ulong ticket=trade.ResultOrder();
      double fp=trade.ResultPrice();
      SendAck(coid,"filled",(long)ticket,fp,"");
     }
   else
     {
      SendAck(coid,"rejected",0,0.0,reason);
     }
  }
//+------------------------------------------------------------------+
//| Renvoie l'acquittement d'exécution au backend.                   |
//+------------------------------------------------------------------+
void SendAck(const string coid,const string status,const long ticket,const double price,const string reason)
  {
   string body="{";
   body+="\"client_order_id\":\""+coid+"\",";
   body+="\"status\":\""+status+"\"";
   if(ticket>0)     body+=",\"ticket\":"+IntegerToString(ticket);
   if(price>0.0)    body+=",\"filled_price\":"+DoubleToString(price,5);
   if(reason!="")   body+=",\"reject_reason\":\""+JsonEscape(reason)+"\"";
   body+="}";
   string resp="";
   if(!HttpRequest("POST",ApiBaseUrl+"/v1/mt5/executions",body,resp))
      Print("ACK échec pour ",coid);
  }
//+------------------------------------------------------------------+
//| Helpers JSON minimalistes (schéma contrôlé par le backend).      |
//+------------------------------------------------------------------+
string JsonStr(const string obj,const string key)
  {
   string pat="\""+key+"\":\"";
   int p=StringFind(obj,pat);
   if(p<0) return("");
   p+=StringLen(pat);
   int e=StringFind(obj,"\"",p);
   if(e<0) return("");
   return(StringSubstr(obj,p,e-p));
  }
//+------------------------------------------------------------------+
double JsonNum(const string obj,const string key)
  {
   string pat="\""+key+"\":";
   int p=StringFind(obj,pat);
   if(p<0) return(0.0);
   p+=StringLen(pat);
   // null → 0
   if(StringSubstr(obj,p,4)=="null") return(0.0);
   int e=p;
   while(e<StringLen(obj))
     {
      ushort c=StringGetCharacter(obj,e);
      if(c==',' || c=='}') break;
      e++;
     }
   return(StringToDouble(StringSubstr(obj,p,e-p)));
  }
//+------------------------------------------------------------------+
string JsonEscape(const string s)
  {
   string out=s;
   StringReplace(out,"\\","\\\\");
   StringReplace(out,"\"","\\\"");
   return(out);
  }
//+------------------------------------------------------------------+
