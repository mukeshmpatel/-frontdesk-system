"use client";
import { useEffect, useState } from "react";
import "./access-check.css";
export default function AccessCheckClient(){
 const [status,setStatus]=useState("Checking your authorized property boundary…"),[detail,setDetail]=useState("Allow location access when prompted."),[busy,setBusy]=useState(true);
 function verify(){
  setBusy(true);setStatus("Checking access…");
  navigator.geolocation.getCurrentPosition(async position=>{
   const response=await fetch("/api/v1/access-boundary",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({action:"CHECK",latitude:position.coords.latitude,longitude:position.coords.longitude,path:location.pathname})});
   const result=await response.json();setBusy(false);
   if(response.ok){setStatus(result.adminBypass?"Administrator access verified":"Property access verified");setDetail("Opening your AAIQ workspace…");setTimeout(()=>location.href="/",700)}
   else{setStatus("Access blocked");setDetail(result.reason||"This device is outside the permitted access boundary.")}
  },async()=>{
   const response=await fetch("/api/v1/access-boundary",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"CHECK",path:location.pathname})});
   const result=await response.json();setBusy(false);
   if(response.ok){location.href="/"}else{setStatus("Location permission required");setDetail(result.reason||"Enable location and try again.")}
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
 }
 useEffect(()=>{verify()},[]);
 return <main className="access-check"><section><div className="access-shield">AQ</div><small>AAIQ SECURE ACCESS BOUNDARY</small><h1>{status}</h1><p>{detail}</p><button disabled={busy} onClick={verify}>{busy?"Verifying…":"Try access check again"}</button><footer>Public site · authenticated apps · property geofence · trusted network · audited admin bypass</footer></section></main>
}
