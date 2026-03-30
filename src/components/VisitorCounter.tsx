import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

function useAnimatedNumber(target: number, duration = 1200) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number>();

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return display;
}

export default function VisitorCounter() {
  const [globalCount, setGlobalCount] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [hasIncremented, setHasIncremented] = useState(false);
  const [pulse, setPulse] = useState(false);

  const animatedGlobal = useAnimatedNumber(globalCount ?? 0);
  const animatedToday = useAnimatedNumber(todayCount ?? 0);

  // Increment on first load
  useEffect(() => {
    if (hasIncremented) return;

    const increment = async () => {
      try {
        const { data, error } = await supabase.rpc("increment_visit");
        if (error) throw error;
        if (data && data.length > 0) {
          setGlobalCount(Number(data[0].global_count));
          setTodayCount(Number(data[0].today_count));
          setPulse(true);
          setTimeout(() => setPulse(false), 600);
        }
        setHasIncremented(true);
      } catch {
        try {
          const { data } = await supabase.rpc("get_visit_counts");
          if (data && data.length > 0) {
            setGlobalCount(Number(data[0].global_count));
            setTodayCount(Number(data[0].today_count));
          }
        } catch {
          // fully offline
        }
      }
    };

    increment();
  }, [hasIncremented]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("visitor_counts_realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "visitor_counts" },
        async () => {
          const { data } = await supabase.rpc("get_visit_counts");
          if (data && data.length > 0) {
            const newGlobal = Number(data[0].global_count);
            const newToday = Number(data[0].today_count);
            if (newGlobal !== globalCount || newToday !== todayCount) {
              setGlobalCount(newGlobal);
              setTodayCount(newToday);
              setPulse(true);
              setTimeout(() => setPulse(false), 600);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [globalCount, todayCount]);

  if (globalCount === null) {
    return (
      <div className="w-full flex justify-center py-6">
        <div className="counter-card animate-pulse">
          <div className="h-10 w-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-6 px-4">
      <div className={`counter-card ${pulse ? "counter-pulse" : ""}`}>
        <span className="counter-globe">🌍</span>
        <div className="counter-content">
          <span className="counter-number">
            {animatedGlobal.toLocaleString()}
          </span>
          <span className="counter-label">visitors worldwide</span>
        </div>
        <div className="counter-divider" />
        <div className="counter-content">
          <span className="counter-number counter-number-small">
            {animatedToday.toLocaleString()}
          </span>
          <span className="counter-label">today</span>
        </div>
      </div>
    </div>
  );
}
