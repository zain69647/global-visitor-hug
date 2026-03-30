import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface LogEntry {
  timestamp: Date;
  type: "success" | "error" | "rate-limited";
  responseTime: number;
  globalCount?: number;
  todayCount?: number;
}

const MAX_REQUESTS_PER_SECOND = 5;
const MAX_LOG_ENTRIES = 20;

export default function Admin() {
  const [testMode, setTestMode] = useState(false);
  const [globalCount, setGlobalCount] = useState<number | null>(null);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [totalSuccess, setTotalSuccess] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);
  const [avgResponseTime, setAvgResponseTime] = useState(0);
  const [visitsPerMinute, setVisitsPerMinute] = useState(0);

  const requestTimestamps = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const minuteCounterRef = useRef<number[]>([]);

  // Fetch current counts on mount
  useEffect(() => {
    const fetchCounts = async () => {
      const { data } = await supabase.rpc("get_visit_counts");
      if (data && data.length > 0) {
        setGlobalCount(Number(data[0].global_count));
        setTodayCount(Number(data[0].today_count));
      }
    };
    fetchCounts();
  }, []);

  // Calculate visits per minute
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      minuteCounterRef.current = minuteCounterRef.current.filter(
        (t) => now - t < 60000
      );
      setVisitsPerMinute(minuteCounterRef.current.length);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const isRateLimited = useCallback(() => {
    const now = Date.now();
    requestTimestamps.current = requestTimestamps.current.filter(
      (t) => now - t < 1000
    );
    return requestTimestamps.current.length >= MAX_REQUESTS_PER_SECOND;
  }, []);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));
  }, []);

  const sendTestVisit = useCallback(async () => {
    if (isRateLimited()) {
      addLog({
        timestamp: new Date(),
        type: "rate-limited",
        responseTime: 0,
      });
      setTotalFailed((p) => p + 1);
      return;
    }

    requestTimestamps.current.push(Date.now());
    const start = performance.now();

    try {
      const { data, error } = await supabase.rpc("increment_visit");
      const responseTime = Math.round(performance.now() - start);

      if (error) throw error;

      if (data && data.length > 0) {
        const g = Number(data[0].global_count);
        const t = Number(data[0].today_count);
        setGlobalCount(g);
        setTodayCount(t);
        addLog({
          timestamp: new Date(),
          type: "success",
          responseTime,
          globalCount: g,
          todayCount: t,
        });
        minuteCounterRef.current.push(Date.now());
        setTotalSuccess((p) => p + 1);
        setAvgResponseTime((prev) => {
          const total = totalSuccess + 1;
          return Math.round((prev * (total - 1) + responseTime) / total);
        });
      }
    } catch {
      const responseTime = Math.round(performance.now() - start);
      addLog({ timestamp: new Date(), type: "error", responseTime });
      setTotalFailed((p) => p + 1);
    }
  }, [isRateLimited, addLog, totalSuccess]);

  const startAutoTest = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      sendTestVisit();
    }, 500);
  }, [isRunning, sendTestVisit]);

  const stopAutoTest = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const successRate =
    totalSuccess + totalFailed > 0
      ? Math.round((totalSuccess / (totalSuccess + totalFailed)) * 100)
      : 100;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Visitor Counter Admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Safe testing &amp; analytics dashboard
            </p>
          </div>
          <Link to="/">
            <Button variant="outline" size="sm">
              ← Back to site
            </Button>
          </Link>
        </div>

        {/* Test Mode Toggle */}
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Switch
                checked={testMode}
                onCheckedChange={(v) => {
                  setTestMode(v);
                  if (!v) stopAutoTest();
                }}
              />
              <span className="text-sm font-medium text-foreground">
                Test Mode
              </span>
              {testMode && (
                <Badge className="bg-accent text-accent-foreground">
                  Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Max {MAX_REQUESTS_PER_SECOND} req/sec
            </p>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="Total Visits"
            value={globalCount?.toLocaleString() ?? "—"}
          />
          <StatCard
            label="Today"
            value={todayCount?.toLocaleString() ?? "—"}
          />
          <StatCard label="Visits/min" value={String(visitsPerMinute)} />
          <StatCard label="Avg Response" value={`${avgResponseTime}ms`} />
        </div>

        {/* Performance */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Successful
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-accent">
                {totalSuccess}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Failed / Rate-Limited
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-destructive">
                {totalFailed}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Success Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-foreground">
                {successRate}%
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Test Controls */}
        {testMode && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Test Controls</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button onClick={sendTestVisit} size="sm">
                Send Single Visit
              </Button>
              {isRunning ? (
                <Button onClick={stopAutoTest} variant="destructive" size="sm">
                  Stop Auto-Test
                </Button>
              ) : (
                <Button
                  onClick={startAutoTest}
                  variant="secondary"
                  size="sm"
                >
                  Start Auto-Test (2/sec)
                </Button>
              )}
              <Button
                onClick={() => {
                  setLogs([]);
                  setTotalSuccess(0);
                  setTotalFailed(0);
                  setAvgResponseTime(0);
                  minuteCounterRef.current = [];
                }}
                variant="ghost"
                size="sm"
              >
                Reset Stats
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Activity Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Recent Activity (last {MAX_LOG_ENTRIES})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No activity yet.{" "}
                {!testMode && "Enable Test Mode to begin."}
              </p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {logs.map((log, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded px-2 py-1 text-xs font-mono even:bg-muted/50"
                  >
                    <span className="text-muted-foreground whitespace-nowrap">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <Badge
                      variant={
                        log.type === "success"
                          ? "default"
                          : log.type === "rate-limited"
                          ? "secondary"
                          : "destructive"
                      }
                      className="text-[10px] px-1.5 py-0"
                    >
                      {log.type}
                    </Badge>
                    <span className="text-muted-foreground">
                      {log.responseTime}ms
                    </span>
                    {log.globalCount != null && (
                      <span className="text-foreground">
                        global: {log.globalCount.toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
