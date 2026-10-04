import {useEffect, useState} from "react";
import {ApiError} from "@/lib/api";

/** Respect server cooldowns without automatically repeating credential writes. */
export function useRetryAfter(error: unknown) {
  const [seconds, setSeconds] = useState(0);
  useEffect(()=>{
    const wait = error instanceof ApiError ? error.retryAfter ?? 0 : 0;
    const deadline = Date.now() + wait * 1000;
    const tick = ()=>setSeconds(Math.max(0, Math.ceil((deadline-Date.now())/1000)));
    tick();
    if (!wait) return;
    const timer = setInterval(tick, 1000);
    return ()=>clearInterval(timer);
  }, [error]);
  return seconds;
}
