"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RoomStatus = "VACANT" | "CLEAN" | "DIRTY" | "OCCUPIED" | "OUT_OF_ORDER";
type LiveRoom = {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  currentTemp: number | null;
  climateProfile: "COMFORT" | "ECO_MODE";
  activeWorkers: Array<{
    id: string;
    displayName: string;
    department: string;
    workState: string;
    currentLatitude: number | null;
    currentLongitude: number | null;
    lastLocationAt: string | null;
  }>;
  activeTask: {
    id: string;
    title: string;
    urgency: string;
    status: string;
    assignedUserId: string | null;
  } | null;
};

type GridResponse = {
  propertyName: string;
  generatedAt: string;
  rooms: LiveRoom[];
};

export type PropertyLiveGridProps = {
  apiBaseUrl: string;
  propertyId: string;
  accessToken: string;
};

const statusStyle: Record<RoomStatus, string> = {
  CLEAN: "border-emerald-200 bg-emerald-50 text-emerald-950",
  DIRTY: "border-amber-300 bg-amber-50 text-amber-950",
  OCCUPIED: "border-blue-300 bg-blue-50 text-blue-950",
  OUT_OF_ORDER: "border-red-300 bg-red-50 text-red-950",
  VACANT: "border-slate-200 bg-white text-slate-900",
};

export default function PropertyLiveGrid({ apiBaseUrl, propertyId, accessToken }: PropertyLiveGridProps) {
  const [data, setData] = useState<GridResponse | null>(null);
  const [connection, setConnection] = useState<"CONNECTING" | "LIVE" | "RETRYING">("CONNECTING");
  const [error, setError] = useState<string | null>(null);
  const base = useMemo(() => apiBaseUrl.replace(/\/$/, ""), [apiBaseUrl]);

  const load = useCallback(async () => {
    const response = await fetch(`${base}/api/v1/property/live-grid?propertyId=${encodeURIComponent(propertyId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Property grid returned HTTP ${response.status}.`);
    setData(await response.json() as GridResponse);
  }, [accessToken, base, propertyId]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const connect = async () => {
      try {
        await load();
        const ticketResponse = await fetch(`${base}/api/v1/realtime/ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ propertyId }),
        });
        if (!ticketResponse.ok) throw new Error(`Realtime ticket returned HTTP ${ticketResponse.status}.`);
        const { ticket } = await ticketResponse.json() as { ticket: string };
        const wsUrl = new URL(`${base.replace(/^http/, "ws")}/api/v1/realtime`);
        wsUrl.searchParams.set("propertyId", propertyId);
        wsUrl.searchParams.set("ticket", ticket);
        socket = new WebSocket(wsUrl);
        socket.onopen = () => { setConnection("LIVE"); setError(null); };
        socket.onmessage = (message) => {
          const event = JSON.parse(String(message.data)) as { type?: string };
          if (event.type === "room.telemetry" || event.type === "task.created" || event.type === "task.updated") {
            void load();
          }
        };
        socket.onclose = () => {
          if (stopped) return;
          setConnection("RETRYING");
          retry = setTimeout(() => void connect(), 3_000);
        };
      } catch (caught) {
        if (stopped) return;
        setError(caught instanceof Error ? caught.message : "Property telemetry is unavailable.");
        setConnection("RETRYING");
        retry = setTimeout(() => void connect(), 5_000);
      }
    };
    void connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [accessToken, base, load, propertyId]);

  const floors = useMemo(() => {
    const grouped = new Map<number, LiveRoom[]>();
    for (const room of data?.rooms ?? []) grouped.set(room.floor, [...(grouped.get(room.floor) ?? []), room]);
    return [...grouped.entries()].sort(([left], [right]) => left - right);
  }, [data]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#1A365D]">{data?.propertyName ?? "Live Property Grid"}</h2>
          <p className="text-xs font-medium text-slate-500">Rooms, climate, tasks, and current staff location by floor.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${connection === "LIVE" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {connection}
        </span>
      </header>
      {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {!data && !error && <div className="py-12 text-center text-sm text-slate-500">Loading live property telemetry…</div>}
      <div className="space-y-7">
        {floors.map(([floor, rooms]) => (
          <div key={floor}>
            <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-slate-600">Floor {floor}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {rooms.map((room) => (
                <article key={room.id} className={`min-h-36 rounded-xl border p-4 transition-colors ${statusStyle[room.status]}`}>
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-base">Room {room.number}</strong>
                    <span className="rounded bg-white/70 px-2 py-0.5 text-[10px] font-black">{room.status.replaceAll("_", " ")}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
                    <span>{room.currentTemp === null ? "No sensor" : `${room.currentTemp.toFixed(1)}°F`}</span>
                    <span className="rounded bg-white/70 px-1.5 py-0.5 text-[10px]">{room.climateProfile.replace("_", " ")}</span>
                  </div>
                  <div className="mt-3 border-t border-current/10 pt-2 text-xs">
                    {room.activeWorkers.length
                      ? room.activeWorkers.map((worker) => (
                        <div key={worker.id} className="truncate font-semibold">
                          {worker.displayName} · {worker.department.replace("_", " ")}
                          {worker.currentLatitude !== null && worker.currentLongitude !== null
                            ? ` · ${worker.currentLatitude.toFixed(4)}, ${worker.currentLongitude.toFixed(4)}`
                            : ""}
                        </div>
                      ))
                      : <span className="opacity-60">No worker in room</span>}
                    {room.activeTask && <div className="mt-1 truncate font-bold">{room.activeTask.urgency}: {room.activeTask.title}</div>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
