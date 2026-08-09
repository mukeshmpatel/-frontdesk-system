"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import StaffOperations from "./staff-operations";
import AaiqCommandStrip from "./components/aaiq-command-strip";
import SmartQuickLinks from "./components/smart-quick-links";

type View = "home" | "calendar" | "inbox" | "memories" | "sources" | "staff";
type Reminder = {
  id: string;
  title: string;
  scheduledAt: string;
  note: string;
  sourceType: string;
  sourceLabel: string;
  status: string;
  confidence: number;
  mediaId: string | null;
};
type Memory = {
  id: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
};
type Account = { id: string; email: string; name: string | null };
type IntakeSource = {
  id: string;
  name: string;
  provider: string;
  lastReceivedAt: string | null;
};
type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
};
type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type NotificationPreferences = {
  enabled: boolean;
  tone: boolean;
  spoken: boolean;
  video: boolean;
  snoozes: number[];
};

type AiInsight = {
  label: string;
  reason: string;
};

const defaultNotificationPreferences: NotificationPreferences = {
  enabled: false,
  tone: true,
  spoken: true,
  video: true,
  snoozes: [10, 15, 30],
};

const sourceNames: Record<string, string> = {
  gmail: "Gmail",
  outlook: "Outlook",
  text: "Text",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  slack: "Slack",
  teams: "Teams",
  telegram: "Telegram",
  voice: "Voice",
  video: "Video",
  manual: "Manual",
};

const appTimeZone = "America/Chicago";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function localDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function friendlyDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: appTimeZone }).format(new Date(value));
}

function friendlyTime(value: string | Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function monthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function sameDay(iso: string, key: string) {
  return dateKey(new Date(iso)) === key;
}

function sourceInitial(source: string) {
  if (source === "gmail") return "G";
  if (source === "outlook") return "O";
  if (source === "whatsapp") return "W";
  if (source === "slack") return "S";
  if (source === "teams") return "T";
  if (source === "voice") return "V";
  if (source === "video") return "▶";
  return "+";
}

function bytesLabel(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dateAfterMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function currentTimestamp() {
  return Date.now();
}

function hourAtAppTimeZone(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: appTimeZone }).format(date));
}

function isImportant(reminder: Reminder) {
  return /\b(important|urgent|deadline|due|appointment|reservation|payment|expires?|doctor|flight|pickup)\b/i.test(
    `${reminder.title} ${reminder.note}`,
  );
}

function reminderSignature(reminder: Reminder) {
  const title = reminder.title
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${reminder.sourceType}|${dateKey(new Date(reminder.scheduledAt))}|${title}`;
}

function collapseSimilarReminders(reminders: Reminder[]) {
  const unique = new Map<string, Reminder>();
  for (const reminder of reminders) {
    const key = reminderSignature(reminder);
    const existing = unique.get(key);
    if (!existing || reminder.confidence > existing.confidence) unique.set(key, reminder);
  }
  return [...unique.values()];
}

function aiInsight(reminder: Reminder): AiInsight {
  const hasAction = /\b(meeting|appointment|reservation|deadline|due|call|pickup|payment|flight|check[ -]?in|renew|submit|follow[ -]?up)\b/i.test(`${reminder.title} ${reminder.note}`);
  if (reminder.confidence >= 90) {
    return { label: "High confidence", reason: hasAction ? "AAI Q found a clear action, date, and time." : "AAI Q found a clear date and time." };
  }
  if (reminder.confidence >= 75) {
    return { label: "Review recommended", reason: hasAction ? "The action is clear, but one scheduling detail may need confirmation." : "A date was found, but the intent may need confirmation." };
  }
  return { label: "Low confidence", reason: "AAI Q is uncertain. Review before adding this to your calendar." };
}

function suggestedReplies(reminder: Reminder) {
  const text = `${reminder.title} ${reminder.note}`;
  if (/\b(meeting|appointment|reservation|interview|visit)\b/i.test(text)) {
    return ["Confirmed - I will be there.", "Thank you. I added this to my calendar.", "I need a different time. Please send another option."];
  }
  if (/\b(payment|invoice|due|deadline|submit)\b/i.test(text)) {
    return ["Thank you for the reminder. I am taking care of it.", "Received - I added the due date to my calendar.", "Please send the details I need to complete this."];
  }
  return ["Thanks - I added this to my calendar.", "Received. I will follow up shortly.", "Please send one more detail so I can confirm."];
}

export default function DaymarkClient({ displayName, userEmail, initialNow }: { displayName: string; userEmail: string; initialNow: string }) {
  const now = useMemo(() => new Date(initialNow), [initialNow]);
  const currentHour = hourAtAppTimeZone(now);
  const todayKey = dateKey(now);
  const [view, setView] = useState<View>("home");
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [intakeSources, setIntakeSources] = useState<IntakeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [captureText, setCaptureText] = useState("");
  const [listening, setListening] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [recording, setRecording] = useState(false);
  const [videoTitle, setVideoTitle] = useState("A moment worth remembering");
  const [videoWhen, setVideoWhen] = useState(localDateTimeValue(new Date(now.getTime() + 24 * 60 * 60 * 1000)));
  const [playingMemory, setPlayingMemory] = useState<Memory | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationReady, setNotificationReady] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>(defaultNotificationPreferences);
  const [activeAlert, setActiveAlert] = useState<Reminder | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editWhen, setEditWhen] = useState("");
  const [replyReminder, setReplyReminder] = useState<Reminder | null>(null);
  const [replyText, setReplyText] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mounted, setMounted] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const notifiedRef = useRef(new Set<string>());
  const notificationPreferencesRef = useRef(notificationPreferences);
  const playedMediaRef = useRef("");

  async function loadData() {
    const [reminderResponse, memoryResponse, accountResponse, sourceResponse] = await Promise.all([
      fetch("/api/reminders", { cache: "no-store" }),
      fetch("/api/memories", { cache: "no-store" }),
      fetch("/api/google/accounts", { cache: "no-store" }),
      fetch("/api/sources", { cache: "no-store" }),
    ]);
    const reminderData = (await reminderResponse.json()) as { reminders?: Reminder[] };
    const memoryData = (await memoryResponse.json()) as { memories?: Memory[] };
    const accountData = (await accountResponse.json()) as { accounts?: Account[] };
    const sourceData = (await sourceResponse.json()) as { sources?: IntakeSource[] };
    setReminders(reminderData.reminders ?? []);
    setMemories(memoryData.memories ?? []);
    setAccounts(accountData.accounts ?? []);
    setIntakeSources(sourceData.sources ?? []);
    return accountData.accounts ?? [];
  }

  useEffect(() => {
    // Hydration intentionally swaps the deterministic branded shell for the
    // interactive, device-aware dashboard after the first client render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const query = new URLSearchParams(window.location.search);
    const shared = query.get("shared");
    const staffViewTimer = query.get("view") === "staff"
      ? window.setTimeout(() => setView("staff"), 0)
      : undefined;
    let sharedTimer: number | undefined;
    if (shared) {
      sharedTimer = window.setTimeout(() => {
        setCaptureText(shared);
        window.history.replaceState({}, "", "/");
      }, 0);
    }
    const loadTimer = window.setTimeout(() => {
      void loadData()
        .then(async (loadedAccounts) => {
          if (cancelled) return;
          setLoading(false);
          const scanKey = `daymark-scan-${new Date().toISOString().slice(0, 13)}`;
          if (loadedAccounts.length && !sessionStorage.getItem(scanKey)) {
            sessionStorage.setItem(scanKey, "1");
            await Promise.allSettled(
              loadedAccounts.map((account) => fetch(`/api/google/accounts/${account.id}/scan`, { method: "POST" })),
            );
            if (!cancelled) await loadData();
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLoading(false);
            setToast("AAI Q could not refresh your timeline.");
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      if (staffViewTimer) window.clearTimeout(staffViewTimer);
      if (sharedTimer) window.clearTimeout(sharedTimer);
      window.clearTimeout(loadTimer);
    };
  }, []);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  useEffect(() => {
    let preferencesTimer: number | undefined;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    try {
      const saved = window.localStorage.getItem("daymark-notification-preferences-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<NotificationPreferences>;
        const snoozes = Array.isArray(parsed.snoozes)
          ? parsed.snoozes.map(Number).filter((value) => value >= 1 && value <= 180).slice(0, 3)
          : defaultNotificationPreferences.snoozes;
        preferencesTimer = window.setTimeout(() => setNotificationPreferences({
            ...defaultNotificationPreferences,
            ...parsed,
            snoozes: snoozes.length === 3 ? snoozes : defaultNotificationPreferences.snoozes,
            enabled: parsed.enabled === true && "Notification" in window && Notification.permission === "granted",
        }), 0);
      }
    } catch {
      window.localStorage.removeItem("daymark-notification-preferences-v1");
    }
    const readyTimer = window.setTimeout(() => setNotificationReady(true), 0);
    return () => {
      if (preferencesTimer) window.clearTimeout(preferencesTimer);
      window.clearTimeout(readyTimer);
    };
  }, []);

  useEffect(() => {
    notificationPreferencesRef.current = notificationPreferences;
    if (!notificationReady) return;
    window.localStorage.setItem("daymark-notification-preferences-v1", JSON.stringify(notificationPreferences));
  }, [notificationPreferences, notificationReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (previewRef.current && videoStream) {
      previewRef.current.srcObject = videoStream;
      previewRef.current.play().catch(() => undefined);
    }
  }, [videoStream, videoOpen]);

  useEffect(() => {
    const mediaId = new URLSearchParams(window.location.search).get("play") ?? "";
    if (!mediaId || playedMediaRef.current === mediaId || !memories.length) return;
    const memory = memories.find((item) => item.id === mediaId);
    if (!memory) return;
    playedMediaRef.current = mediaId;
    const timer = window.setTimeout(() => setPlayingMemory(memory), 0);
    window.history.replaceState({}, "", "/");
    return () => window.clearTimeout(timer);
  }, [memories]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    videoStream?.getTracks().forEach((track) => track.stop());
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoStream, videoUrl]);

  const rawActiveReminders = useMemo(
    () => reminders.filter((reminder) => reminder.status !== "done" && reminder.status !== "dismissed"),
    [reminders],
  );
  const activeReminders = useMemo(() => collapseSimilarReminders(rawActiveReminders), [rawActiveReminders]);
  const todayReminders = useMemo(
    () => activeReminders.filter((reminder) => sameDay(reminder.scheduledAt, todayKey)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [activeReminders, todayKey],
  );
  const upcoming = useMemo(
    () => activeReminders.filter((reminder) => new Date(reminder.scheduledAt).getTime() >= now.getTime()).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [activeReminders, now],
  );
  const suggestions = useMemo(() => activeReminders.filter((reminder) => reminder.status === "suggested"), [activeReminders]);
  const rawSuggestionCount = useMemo(() => rawActiveReminders.filter((reminder) => reminder.status === "suggested").length, [rawActiveReminders]);
  const duplicateSuggestionCount = Math.max(0, rawSuggestionCount - suggestions.length);
  const verifiedIntakeSources = useMemo(() => intakeSources.filter((source) => Boolean(source.lastReceivedAt)), [intakeSources]);
  const waitingIntakeSources = intakeSources.length - verifiedIntakeSources.length;
  const verifiedSourceCount = accounts.length + verifiedIntakeSources.length;
  const selectedReminders = useMemo(
    () => activeReminders.filter((reminder) => sameDay(reminder.scheduledAt, selectedDate)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [activeReminders, selectedDate],
  );
  const calendarDays = useMemo(() => {
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [visibleMonth]);

  function playNotificationTone(important: boolean) {
    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (important ? 0.9 : 0.55));
    gain.connect(context.destination);
    const notes = important ? [659, 784, 988] : [659, 784];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.18);
      oscillator.stop(context.currentTime + index * 0.18 + 0.22);
    });
    window.setTimeout(() => context.close().catch(() => undefined), 1400);
  }

  async function showSystemNotification(reminder: Reminder, phrase: string) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const preferences = notificationPreferencesRef.current;
    const options = preferences.snoozes.slice(0, 2).map((minutes) => ({
      action: `snooze-${minutes}`,
      title: `Snooze ${minutes} min`,
    }));
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        const richNotificationOptions: NotificationOptions & { actions: Array<{ action: string; title: string }> } = {
          body: reminder.title,
          tag: `daymark-${reminder.id}`,
          requireInteraction: isImportant(reminder),
          actions: options,
          data: { reminderId: reminder.id, mediaId: reminder.mediaId },
        };
        await registration.showNotification(phrase, richNotificationOptions);
        return;
      } catch {
        // Fall back to a standard browser notification.
      }
    }
    new Notification(phrase, { body: reminder.title, tag: `daymark-${reminder.id}` });
  }

  async function announceReminder(reminder: Reminder, includeSystemNotification = true) {
    const preferences = notificationPreferencesRef.current;
    const important = isImportant(reminder);
    const phrase = reminder.mediaId && preferences.video
      ? "You have a video message."
      : important
        ? "You have an important message."
        : "You have a message.";
    if (preferences.tone) playNotificationTone(important);
    if (preferences.spoken && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const spoken = new SpeechSynthesisUtterance(`${phrase} ${reminder.title}`);
      spoken.rate = 0.94;
      window.speechSynthesis.speak(spoken);
    }
    setActiveAlert(reminder);
    if (includeSystemNotification) await showSystemNotification(reminder, phrase);
  }

  async function requestNotificationAccess() {
    if (!("Notification" in window)) {
      setToast("Browser notifications are not supported on this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setNotificationPreferences((current) => ({ ...current, enabled }));
    setToast(enabled ? "AAI Q alerts are on" : "Notifications were not allowed in this browser.");
    if (enabled) {
      const preview: Reminder = {
        id: "notification-preview",
        title: "This is how an important AAI Q reminder sounds.",
        scheduledAt: new Date().toISOString(),
        note: "Important notification preview",
        sourceType: "manual",
        sourceLabel: "Notification preview",
        status: "scheduled",
        confidence: 100,
        mediaId: null,
      };
      window.setTimeout(() => void announceReminder(preview, false), 100);
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setToast(choice.outcome === "accepted" ? "AAI Q is being installed." : "You can install AAI Q later from your browser menu.");
  }

  function previewConfiguredAlert() {
    const preview: Reminder = {
      id: "notification-preview",
      title: "Prescription pickup is due soon.",
      scheduledAt: new Date().toISOString(),
      note: "Important notification preview",
      sourceType: "manual",
      sourceLabel: "Notification preview",
      status: "scheduled",
      confidence: 100,
      mediaId: null,
    };
    void announceReminder(preview, false);
  }

  async function snoozeReminder(reminder: Reminder, minutes: number) {
    const scheduledAt = dateAfterMinutes(minutes);
    setBusy(`snooze-${reminder.id}`);
    const response = await fetch(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scheduledAt, status: "scheduled" }),
    });
    setBusy("");
    if (!response.ok) {
      setToast("This reminder could not be snoozed.");
      return;
    }
    notifiedRef.current.delete(reminder.id);
    if (activeAlert?.id === reminder.id) setActiveAlert(null);
    await loadData();
    setToast(`Snoozed for ${minutes} minutes`);
  }

  function updateSnoozeOption(index: number, value: string) {
    const minutes = Math.max(1, Math.min(180, Number.parseInt(value, 10) || defaultNotificationPreferences.snoozes[index]));
    setNotificationPreferences((current) => ({
      ...current,
      snoozes: current.snoozes.map((item, itemIndex) => itemIndex === index ? minutes : item),
    }));
  }

  useEffect(() => {
    if (!notificationReady || !notificationPreferences.enabled) return;
    const checkDueReminders = () => {
      const currentTime = currentTimestamp();
      activeReminders
        .filter((reminder) => reminder.status === "scheduled")
        .filter((reminder) => {
          const scheduled = new Date(reminder.scheduledAt).getTime();
          return scheduled <= currentTime + 5_000 && scheduled >= currentTime - 60_000;
        })
        .forEach((reminder) => {
          if (notifiedRef.current.has(reminder.id)) return;
          notifiedRef.current.add(reminder.id);
          void announceReminder(reminder);
        });
    };
    checkDueReminders();
    const interval = window.setInterval(checkDueReminders, 15_000);
    return () => window.clearInterval(interval);
    // announceReminder reads the latest device preferences from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReminders, notificationPreferences.enabled, notificationReady]);

  async function createCapture(text = captureText, sourceType = "text") {
    const clean = text.trim();
    if (!clean) return;
    setBusy("capture");
    try {
      const response = await fetch("/api/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: clean, sourceType, sourceLabel: sourceType === "voice" ? "Voice command" : "Quick capture" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Reminder could not be created.");
      setCaptureText("");
      await loadData();
      setToast(sourceType === "voice" ? "Voice reminder added" : "Reminder added to your calendar");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Reminder could not be created.");
    } finally {
      setBusy("");
    }
  }

  function submitCapture(event: FormEvent) {
    event.preventDefault();
    void createCapture();
  }

  function startListening() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setToast("Voice commands work in Chrome or Edge. You can still type the reminder.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim() ?? "";
      if (transcript) setCaptureText(transcript);
      if (result?.isFinal && transcript) void createCapture(transcript, "voice");
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => {
      setListening(false);
      setToast("I could not hear that. Try again or type the reminder.");
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function openVideoRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      setVideoBlob(null);
      setVideoUrl("");
      setVideoStream(stream);
      setVideoOpen(true);
    } catch {
      setToast("Camera and microphone access are needed to record a video memory.");
    }
  }

  function beginRecording() {
    if (!videoStream) return;
    chunksRef.current = [];
    const preferred = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
    const recorder = new MediaRecorder(videoStream, { mimeType: preferred });
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      setVideoBlob(blob);
      setVideoUrl(url);
      setRecording(false);
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    };
    recorderRef.current = recorder;
    recorder.start(500);
    setRecording(true);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  function closeVideoRecorder() {
    if (recording) recorderRef.current?.stop();
    videoStream?.getTracks().forEach((track) => track.stop());
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoOpen(false);
    setVideoStream(null);
    setVideoBlob(null);
    setVideoUrl("");
    setRecording(false);
  }

  async function saveVideoMemory() {
    if (!videoBlob) return;
    setBusy("video");
    try {
      const form = new FormData();
      form.set("file", new File([videoBlob], "memory.webm", { type: videoBlob.type || "video/webm" }));
      form.set("title", videoTitle);
      const memoryResponse = await fetch("/api/memories", { method: "POST", body: form });
      const memory = (await memoryResponse.json()) as { id?: string; error?: string };
      if (!memoryResponse.ok || !memory.id) throw new Error(memory.error ?? "Video could not be saved.");
      const reminderResponse = await fetch("/api/reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: videoTitle,
          scheduledAt: new Date(videoWhen).toISOString(),
          note: "A video memory is attached to this reminder.",
          sourceType: "video",
          sourceLabel: "Video memory",
          mediaId: memory.id,
        }),
      });
      if (!reminderResponse.ok) throw new Error("The video saved, but its reminder could not be added.");
      closeVideoRecorder();
      await loadData();
      setView("memories");
      setToast("Video memory saved to your calendar");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Video could not be saved.");
    } finally {
      setBusy("");
    }
  }

  async function updateStatus(reminder: Reminder, status: string) {
    const response = await fetch(`/api/reminders/${reminder.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      if (activeAlert?.id === reminder.id) setActiveAlert(null);
      await loadData();
      setToast(status === "done" ? "Marked complete" : status === "scheduled" ? "Added to calendar" : "Suggestion dismissed");
    }
  }

  async function updateSuggestionGroup(reminder: Reminder, status: "scheduled" | "dismissed") {
    const signature = reminderSignature(reminder);
    const group = reminders.filter((item) => item.status === "suggested" && reminderSignature(item) === signature);
    setBusy(`review-${reminder.id}`);
    const results = await Promise.all(group.map((item) => fetch(`/api/reminders/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    })));
    setBusy("");
    if (results.some((response) => !response.ok)) {
      setToast("AAI Q could not save that review.");
      return;
    }
    await loadData();
    setToast(status === "scheduled"
      ? group.length > 1 ? `Added once and merged ${group.length - 1} duplicate suggestions` : "Added to your calendar"
      : group.length > 1 ? `Skipped ${group.length} similar suggestions` : "Suggestion skipped");
  }

  function openReminderEditor(reminder: Reminder) {
    setEditingReminder(reminder);
    setEditTitle(reminder.title);
    setEditWhen(localDateTimeValue(new Date(reminder.scheduledAt)));
  }

  async function saveReminderEdit() {
    if (!editingReminder || !editTitle.trim() || !editWhen) return;
    setBusy(`edit-${editingReminder.id}`);
    const response = await fetch(`/api/reminders/${editingReminder.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: editTitle.trim(),
        scheduledAt: new Date(editWhen).toISOString(),
        status: "scheduled",
      }),
    });
    setBusy("");
    if (!response.ok) {
      setToast("That reminder could not be updated.");
      return;
    }
    setEditingReminder(null);
    await loadData();
    setToast("Edited and added to your calendar");
  }

  function openReplyHelper(reminder: Reminder) {
    setReplyReminder(reminder);
    setReplyText(suggestedReplies(reminder)[0]);
  }

  async function copyReplyDraft() {
    if (!replyText.trim()) return;
    try {
      await navigator.clipboard.writeText(replyText.trim());
      setReplyReminder(null);
      setToast("Reply copied - review it before sending");
    } catch {
      setToast("Select and copy the reply text manually.");
    }
  }

  async function scanInboxes(days = 14) {
    if (!accounts.length) {
      setView("sources");
      setToast("Connect Gmail first, or use a private source link.");
      return;
    }
    const busyKey = days === 30 ? "scan-30" : "scan";
    setBusy(busyKey);
    const results = await Promise.all(
      accounts.map(async (account) => {
        const response = await fetch(`/api/google/accounts/${account.id}/scan`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ days }),
        });
        return (await response.json()) as { remindersCreated?: number; suggestionsCreated?: number; checkedCount?: number };
      }),
    );
    await loadData();
    setBusy("");
    const created = results.reduce((sum, result) => sum + (result.remindersCreated ?? 0), 0);
    const checked = results.reduce((sum, result) => sum + (result.checkedCount ?? 0), 0);
    setToast(created
      ? `${created} missing calendar item${created === 1 ? "" : "s"} recovered from the last ${days} days`
      : `Last ${days} days checked · ${checked} messages reviewed`);
  }

  function renderReminder(reminder: Reminder, compact = false) {
    const insight = aiInsight(reminder);
    const similarCount = reminders.filter((item) => item.status === reminder.status && reminderSignature(item) === reminderSignature(reminder)).length;
    return (
      <article className={`timeline-item${reminder.status === "suggested" ? " suggestion" : ""}`} key={reminder.id}>
        <div className={`source-avatar source-${reminder.sourceType}`} aria-hidden="true">{sourceInitial(reminder.sourceType)}</div>
        <div className="timeline-copy">
          <div className="timeline-title-row">
            <strong>{reminder.title}</strong>
            {reminder.mediaId && <button className="memory-chip" type="button" onClick={() => {
              const memory = memories.find((item) => item.id === reminder.mediaId);
              if (memory) setPlayingMemory(memory);
            }}>Play video</button>}
          </div>
          <span>{friendlyTime(reminder.scheduledAt)} · {reminder.sourceLabel || sourceNames[reminder.sourceType] || "AAI Q"}</span>
          {!compact && reminder.note && <p>{reminder.note.split("\n")[0]}</p>}
          {reminder.status === "suggested" && <div className="ai-explanation"><b>{reminder.confidence}% AI confidence</b><span>{insight.label} · {insight.reason}</span>{similarCount > 1 && <em>{similarCount} similar messages grouped</em>}</div>}
        </div>
        {reminder.status === "suggested" ? (
          <div className="review-actions">
            <button type="button" disabled={busy === `review-${reminder.id}`} onClick={() => void updateSuggestionGroup(reminder, "scheduled")}>Keep</button>
            <button type="button" onClick={() => openReminderEditor(reminder)}>Edit</button>
            <button type="button" onClick={() => openReplyHelper(reminder)}>Draft reply</button>
            <button type="button" disabled={busy === `review-${reminder.id}`} onClick={() => void updateSuggestionGroup(reminder, "dismissed")}>Skip</button>
          </div>
        ) : (
          <div className="reminder-actions">
            {isImportant(reminder) && <span className="important-badge">Important</span>}
            <div className="snooze-actions" aria-label={`Snooze ${reminder.title}`}>
              <span>Snooze</span>
              {notificationPreferences.snoozes.map((minutes) => (
                <button key={minutes} type="button" disabled={busy === `snooze-${reminder.id}`} onClick={() => void snoozeReminder(reminder, minutes)}>{minutes}m</button>
              ))}
            </div>
            <button className="done-button" type="button" onClick={() => updateStatus(reminder, "done")} aria-label={`Complete ${reminder.title}`}>Done</button>
          </div>
        )}
      </article>
    );
  }

  if (!mounted) {
    return (
      <main className="daymark-shell embedded-home" aria-busy="true">
        <section className="workspace">
          <header className="mobile-header">
            <div className="daymark-logo">
              <Image className="aai-tech-logo" src="/aai-tech-logo.jpeg" alt="AAI Tech Inc" width={666} height={612} /><span>AAI Q</span>
            </div>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className="daymark-shell embedded-home">
      <section className="workspace">
        <header className="mobile-header">
          <button className="daymark-logo" type="button" onClick={() => setView("home")}>
            <Image className="aai-tech-logo" src="/aai-tech-logo.jpeg" alt="AAI Tech Inc" width={666} height={612} /><span>AAI Q</span>
          </button>
          <a href="/accounts">{accounts.length + intakeSources.length} sources</a>
        </header>

        <nav className="home-view-tabs" aria-label="AAIQ Today workspace views">
          {([
            ["home", "Today"],
            ["calendar", "Calendar"],
            ["inbox", "Smart Inbox"],
            ["memories", "Memories"],
            ["sources", "Sources"],
            ["staff", "Staff"],
          ] as Array<[View, string]>).map(([id, label]) => <button key={id} className={view===id?"active":""} type="button" onClick={()=>setView(id)}>{label}{id==="inbox"&&suggestions.length>0&&<b>{suggestions.length}</b>}</button>)}
          <a href="/guest-journey">Guest Journey</a>
        </nav>

        {view === "home" && (
          <>
            <section className="welcome-bar">
              <div><p>{friendlyDay(now)}</p><h1>Good {currentHour < 12 ? "morning" : currentHour < 18 ? "afternoon" : "evening"}, {displayName.split(" ")[0]}.</h1></div>
              <div className="welcome-actions">
                {installPrompt && <button className="alert-status" type="button" onClick={() => void installApp()}><span aria-hidden="true">↓</span>Install app</button>}
                <button className={`alert-status${notificationPreferences.enabled ? " ready" : ""}`} type="button" onClick={() => setNotificationOpen(true)}><span aria-hidden="true">♪</span>{notificationPreferences.enabled ? "Alerts on" : "Turn on alerts"}</button>
                <button className="source-status" type="button" onClick={() => setView("sources")}><i />{verifiedSourceCount} verified source{verifiedSourceCount === 1 ? "" : "s"}</button>
              </div>
            </section>
            <AaiqCommandStrip />

            <SmartQuickLinks />

            <section className="capture-card">
              <div className="capture-intro">
                <span className="spark-dot" aria-hidden="true">✦</span>
                <div><p>Tell AAI Q what to remember</p><small>Natural language works. Try “Call the roofer tomorrow at 9 AM.”</small></div>
              </div>
              <form onSubmit={submitCapture}>
                <input value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="Type, paste, or speak a reminder…" aria-label="Reminder command" />
                <div className="capture-actions">
                  <button className={`capture-tool${listening ? " active" : ""}`} type="button" onClick={startListening} aria-label="Create reminder with voice"><span aria-hidden="true">●</span>{listening ? "Listening…" : "Voice"}</button>
                  <button className="capture-tool" type="button" onClick={openVideoRecorder} aria-label="Record video memory"><span aria-hidden="true">▣</span>Video</button>
                  <button className="capture-submit" type="submit" disabled={!captureText.trim() || busy === "capture"}>{busy === "capture" ? "Thinking…" : "Add to calendar"}</button>
                </div>
              </form>
            </section>

            <section className="ai-focus-card" aria-label="AAI Q assistant summary">
              <div className="ai-orb" aria-hidden="true">AI</div>
              <div className="ai-focus-copy">
                <p>AAI Q assistant</p>
                <h2>{suggestions.length ? `${suggestions.length} message${suggestions.length === 1 ? "" : "s"} need a quick decision` : todayReminders.length ? "Your day is organized" : "You have room to plan ahead"}</h2>
                <span>{suggestions.length ? "Dates and actions were detected, but AAI Q wants your approval before adding uncertain items." : upcoming[0] ? `Next: ${upcoming[0].title} at ${friendlyTime(upcoming[0].scheduledAt)}.` : "Ask in plain language, use voice, or recover the last 30 days from Gmail."}</span>
                <div className="ai-signal-row"><b>Explainable confidence</b><b>Duplicate protection on</b><b>{duplicateSuggestionCount ? `${duplicateSuggestionCount} duplicate${duplicateSuggestionCount === 1 ? "" : "s"} hidden` : "No duplicates found"}</b></div>
              </div>
              <div className="ai-focus-actions">
                {suggestions.length > 0 && <button type="button" onClick={() => setView("inbox")}>Review AI finds</button>}
                <button type="button" onClick={() => void scanInboxes(30)} disabled={busy === "scan-30"}>{busy === "scan-30" ? "Checking..." : "Check last 30 days"}</button>
              </div>
            </section>

            <section className="metric-row" aria-label="AAI Q summary">
              <div><span>{todayReminders.length}</span><p>today</p><small>{todayReminders.length ? "Your day is mapped" : "Open space"}</small></div>
              <div><span>{suggestions.length}</span><p>to review</p><small>Found in messages</small></div>
              <div><span>{memories.length}</span><p>memories</p><small>Voice and video</small></div>
            </section>

            <section className={`notification-strip${notificationPreferences.enabled ? " ready" : ""}`}>
              <span className="notification-mark" aria-hidden="true">♪</span>
              <div><strong>{notificationPreferences.enabled ? "Audio reminders are ready" : "Never miss the moment"}</strong><p>{notificationPreferences.enabled ? `AAI Q can speak alerts and show ${notificationPreferences.snoozes.join(", ")} minute snooze buttons.` : "Turn on browser alerts, spoken messages, video prompts, and your own snooze times."}</p></div>
              <button type="button" onClick={() => setNotificationOpen(true)}>{notificationPreferences.enabled ? "Adjust" : "Set up alerts"}</button>
            </section>

            <section className="section-block">
              <div className="block-heading"><div><p>Your timeline</p><h2>Today</h2></div><button type="button" onClick={() => setView("calendar")}>Open calendar</button></div>
              <div className="timeline-list">
                {loading ? <div className="soft-empty">Reading your private timeline…</div> : todayReminders.length ? todayReminders.map((reminder) => renderReminder(reminder)) : (
                  <div className="soft-empty"><span>○</span><div><strong>Nothing scheduled today</strong><p>Use text, voice, video, or a connected inbox to add something.</p></div></div>
                )}
              </div>
            </section>

            {suggestions.length > 0 && (
              <section className="section-block suggestions-block">
                <div className="block-heading"><div><p>Automatic finds</p><h2>Needs a quick look</h2></div><button type="button" onClick={() => setView("inbox")}>Review all</button></div>
                <div className="timeline-list">{suggestions.slice(0, 3).map((reminder) => renderReminder(reminder, true))}</div>
              </section>
            )}
          </>
        )}

        {view === "calendar" && (
          <section className="page-view">
            <div className="page-heading"><div><p>Everything in one place</p><h1>{monthTitle(visibleMonth)}</h1></div><div className="month-controls"><button type="button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1))}>←</button><button type="button" onClick={() => setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>Today</button><button type="button" onClick={() => setVisibleMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1))}>→</button></div></div>
            <div className="calendar-panel">
              <div className="calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
              <div className="advanced-calendar-grid">
                {calendarDays.map((day) => {
                  const key = dateKey(day);
                  const count = activeReminders.filter((reminder) => sameDay(reminder.scheduledAt, key)).length;
                  return <button key={key} type="button" className={`${day.getMonth() !== visibleMonth.getMonth() ? "outside" : ""}${key === selectedDate ? " selected" : ""}${key === todayKey ? " today" : ""}`} onClick={() => setSelectedDate(key)}><span>{day.getDate()}</span>{count > 0 && <i>{count}</i>}</button>;
                })}
              </div>
            </div>
            <div className="selected-agenda"><div className="block-heading"><div><p>Selected day</p><h2>{friendlyDay(`${selectedDate}T12:00:00`)}</h2></div><span>{selectedReminders.length} items</span></div><div className="timeline-list">{selectedReminders.length ? selectedReminders.map((reminder) => renderReminder(reminder)) : <div className="soft-empty">No reminders on this day.</div>}</div></div>
          </section>
        )}

        {view === "inbox" && (
          <section className="page-view">
            <div className="page-heading"><div><p>From messages to moments</p><h1>Smart inbox</h1></div><div className="heading-actions"><button className="secondary-action" type="button" onClick={() => void scanInboxes(30)} disabled={busy === "scan" || busy === "scan-30"}>{busy === "scan-30" ? "Recovering…" : "Recover 30 days"}</button><button className="primary-action" type="button" onClick={() => void scanInboxes(14)} disabled={busy === "scan" || busy === "scan-30"}>{busy === "scan" ? "Scanning…" : "Scan now"}</button></div></div>
            <div className="inbox-hero"><div><span>✦</span><h2>AAI Q reads for dates, not details.</h2><p>It checks connected inboxes for appointments, deadlines, reservations, and expiring moments, then puts high-confidence items on your calendar. Recovery can review up to the past 30 days.</p></div><b>{suggestions.length}<small>awaiting review</small></b></div>
            <div className="timeline-list inbox-list">{suggestions.length ? suggestions.map((reminder) => renderReminder(reminder)) : <div className="soft-empty"><span>✓</span><div><strong>You are caught up</strong><p>No uncertain calendar items need your attention.</p></div></div>}</div>
            <div className="upcoming-card"><div className="block-heading"><div><p>Automatically scheduled</p><h2>Upcoming from messages</h2></div></div>{upcoming.filter((item) => item.sourceType !== "manual" && item.sourceType !== "voice").slice(0, 8).map((reminder) => renderReminder(reminder, true))}</div>
          </section>
        )}

        {view === "memories" && (
          <section className="page-view">
            <div className="page-heading"><div><p>Remember the feeling</p><h1>Memory library</h1></div><button className="primary-action" type="button" onClick={openVideoRecorder}>Record a memory</button></div>
            <div className="memory-intro"><span className="memory-rings" aria-hidden="true"><i /></span><div><h2>A reminder can be more than words.</h2><p>Record a message for your future self, a family moment, directions, or the reason something matters. AAI Q brings it back on the right day.</p></div></div>
            <div className="memory-grid">
              {memories.length ? memories.map((memory) => (
                <button className="memory-card" type="button" key={memory.id} onClick={() => setPlayingMemory(memory)}>
                  <span className="memory-play">▶</span><div><strong>{memory.title}</strong><small>{friendlyDay(memory.createdAt)} · {bytesLabel(memory.sizeBytes)}</small></div>
                </button>
              )) : <div className="soft-empty memory-empty"><span>▣</span><div><strong>No video memories yet</strong><p>Record your first one and choose when AAI Q should bring it back.</p></div></div>}
            </div>
          </section>
        )}

        {view === "sources" && (
          <section className="page-view">
            <div className="page-heading"><div><p>Your private inputs</p><h1>Connected sources</h1></div><a className="primary-action" href="/accounts">Manage sources</a></div>
            <div className="source-overview">
              <div><span>{verifiedSourceCount}</span><p>verified sources</p></div><div><span>{waitingIntakeSources}</span><p>waiting for setup</p></div><div><span>Private</span><p>separated by user</p></div>
            </div>
            <div className="provider-grid">
              <article className={`provider-card${accounts.length ? " connected" : ""}`}><span className="provider-icon google">G</span><div><strong>Google Gmail</strong><p>{accounts.length ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected with read-only access` : "Ready to connect"}</p></div><b>{accounts.length ? "Verified" : "Add"}</b></article>
              {[{ id: "outlook", name: "Outlook + Microsoft 365", mark: "O" }, { id: "text", name: "Text messages", mark: "#" }, { id: "whatsapp", name: "WhatsApp", mark: "W" }, { id: "slack", name: "Slack", mark: "S" }, { id: "teams", name: "Microsoft Teams", mark: "T" }, { id: "telegram", name: "Telegram", mark: "Tg" }].map((provider) => {
                const providerSources = intakeSources.filter((source) => source.provider === provider.id);
                const connected = providerSources.filter((source) => Boolean(source.lastReceivedAt)).length;
                const waiting = providerSources.length - connected;
                const isPhoneSource = provider.id === "text" || provider.id === "whatsapp";
                return <article className={`provider-card${connected ? " connected" : waiting ? " waiting" : ""}`} key={provider.id}><span className={`provider-icon ${provider.id}`}>{provider.mark}</span><div><strong>{provider.name}</strong><p>{connected ? `${connected} verified connection${connected === 1 ? "" : "s"}` : waiting ? "Created - send a test message to verify" : isPhoneSource ? "Add your phone number" : "Easy guided setup"}</p></div><b>{connected ? "Verified" : waiting ? "Test" : "Add"}</b></article>;
              })}
            </div>
            <a className="manage-source-banner" href="/accounts"><div><span>＋</span><strong>Connect phone, WhatsApp, email, or chat</strong><p>Start with your mobile number. Advanced automation stays available when you want messages added automatically.</p></div><b>Manage connections →</b></a>
          </section>
        )}

        <StaffOperations active={view === "staff"} currentUserEmail={userEmail} onToast={setToast} />
      </section>

      <aside className="context-panel">
        <div className="context-date"><span>{now.getDate()}</span><div><strong>{new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now)}</strong><small>{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now)}</small></div></div>
        <section><p className="context-label">Up next</p>{upcoming[0] ? <div className="next-card"><span>{friendlyTime(upcoming[0].scheduledAt)}</span><strong>{upcoming[0].title}</strong><small>{friendlyDay(upcoming[0].scheduledAt)} · {upcoming[0].sourceLabel}</small></div> : <div className="context-empty">Your next moment will appear here.</div>}</section>
        <section><div className="context-heading"><p className="context-label">Source pulse</p><button type="button" onClick={() => setView("sources")}>View all</button></div><div className="pulse-list"><div><span className="pulse google">G</span><strong>Gmail<small>{accounts.length ? "Connected - scan status is shown after each check" : "Not connected"}</small></strong><i className={accounts.length ? "live" : ""} /></div><div><span className="pulse universal">↗</span><strong>Universal intake<small>{verifiedIntakeSources.length ? `${verifiedIntakeSources.length} verified` : waitingIntakeSources ? `${waitingIntakeSources} waiting for a test message` : "Ready when you are"}</small></strong><i className={verifiedIntakeSources.length ? "live" : ""} /></div><div><span className="pulse memory">▶</span><strong>Video memories<small>{memories.length} saved</small></strong><i className={memories.length ? "live" : ""} /></div></div></section>
        <div className="privacy-card"><span>Private by design</span><p>Your credentials stay encrypted. AAI Q reads only the sources you connect.</p></div>
      </aside>

      <nav className="mobile-nav" aria-label="Primary">
        {(["home", "calendar", "inbox", "memories", "sources", "staff"] as View[]).map((id) => <button key={id} type="button" className={view === id ? "active" : ""} onClick={() => setView(id)}><span>{id === "home" ? "●" : id === "calendar" ? "□" : id === "inbox" ? "✦" : id === "memories" ? "▶" : id === "staff" ? "◎" : "＋"}</span>{id === "home" ? "Today" : id === "staff" ? "Staff" : id.charAt(0).toUpperCase() + id.slice(1)}</button>)}
        <a href="/reports"><span>▥</span>Reports</a>
        <a href="/action-center"><span>⌁</span>Action Center</a>
        <a href="/memory-agent"><span>◉</span>Memory Agent</a>
        <a href="/aaiq-user-management"><span>♙</span>User Access</a>
        <a href="/aaiq-asset-registry"><span>▦</span>Assets</a>
        <a href="/aaiq-setup-agent"><span>✦</span>AI Setup</a>
      </nav>

      {editingReminder && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setEditingReminder(null)}>
          <section className="ai-review-sheet" role="dialog" aria-modal="true" aria-labelledby="edit-reminder-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="video-sheet-heading"><div><p>AI review</p><h2 id="edit-reminder-title">Correct the reminder</h2></div><button type="button" onClick={() => setEditingReminder(null)} aria-label="Close">×</button></div>
            <div className="ai-review-note"><b>{editingReminder.confidence}% confidence</b><span>{aiInsight(editingReminder).reason}</span></div>
            <label><span>Reminder</span><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
            <label><span>Date and time</span><input type="datetime-local" value={editWhen} onChange={(event) => setEditWhen(event.target.value)} /></label>
            <div className="notification-sheet-actions"><button className="secondary-action" type="button" onClick={() => setEditingReminder(null)}>Cancel</button><button className="primary-action" type="button" disabled={!editTitle.trim() || !editWhen || busy === `edit-${editingReminder.id}`} onClick={() => void saveReminderEdit()}>{busy === `edit-${editingReminder.id}` ? "Saving..." : "Save to calendar"}</button></div>
          </section>
        </div>
      )}

      {replyReminder && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setReplyReminder(null)}>
          <section className="ai-review-sheet" role="dialog" aria-modal="true" aria-labelledby="reply-helper-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="video-sheet-heading"><div><p>Preferred response</p><h2 id="reply-helper-title">Choose, adjust, then send yourself</h2></div><button type="button" onClick={() => setReplyReminder(null)} aria-label="Close">×</button></div>
            <p className="reply-disclosure">AAI Q has read-only access and will never send a message automatically. Copy a draft after reviewing it.</p>
            <div className="reply-options">{suggestedReplies(replyReminder).map((reply) => <button key={reply} type="button" className={replyText === reply ? "active" : ""} onClick={() => setReplyText(reply)}>{reply}</button>)}</div>
            <label><span>Your reply</span><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} /></label>
            <div className="notification-sheet-actions"><button className="secondary-action" type="button" onClick={() => setReplyReminder(null)}>Cancel</button><button className="primary-action" type="button" disabled={!replyText.trim()} onClick={() => void copyReplyDraft()}>Copy reviewed reply</button></div>
          </section>
        </div>
      )}

      {notificationOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setNotificationOpen(false)}>
          <section className="notification-sheet" role="dialog" aria-modal="true" aria-labelledby="notification-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="video-sheet-heading"><div><p>Smart alerts</p><h2 id="notification-title">Choose how AAI Q gets your attention</h2></div><button type="button" onClick={() => setNotificationOpen(false)} aria-label="Close">×</button></div>
            <div className={`permission-card${notificationPreferences.enabled ? " ready" : ""}`}>
              <span aria-hidden="true">♪</span><div><strong>{notificationPreferences.enabled ? "Browser alerts are on" : "Allow browser alerts"}</strong><p>AAI Q checks due reminders while the app is open or installed.</p></div>
              {!notificationPreferences.enabled && <button type="button" onClick={() => void requestNotificationAccess()}>Turn on</button>}
            </div>
            <div className="notification-options">
              <label><span><strong>Notification tone</strong><small>Play a gentle two-note sound</small></span><input type="checkbox" checked={notificationPreferences.tone} onChange={(event) => setNotificationPreferences((current) => ({ ...current, tone: event.target.checked }))} /></label>
              <label><span><strong>Spoken message</strong><small>Say “You have a message” or “You have an important message”</small></span><input type="checkbox" checked={notificationPreferences.spoken} onChange={(event) => setNotificationPreferences((current) => ({ ...current, spoken: event.target.checked }))} /></label>
              <label><span><strong>Video reminder prompt</strong><small>Show a Play video button when a memory is attached</small></span><input type="checkbox" checked={notificationPreferences.video} onChange={(event) => setNotificationPreferences((current) => ({ ...current, video: event.target.checked }))} /></label>
            </div>
            <div className="snooze-settings"><div><strong>Quick snooze buttons</strong><p>Choose three delays from 1 to 180 minutes.</p></div><div>{notificationPreferences.snoozes.map((minutes, index) => <label key={index}><input type="number" min="1" max="180" value={minutes} onChange={(event) => updateSnoozeOption(index, event.target.value)} /><span>min</span></label>)}</div></div>
            <div className="notification-sheet-actions"><button className="secondary-action" type="button" onClick={previewConfiguredAlert}>Test alert</button><button className="primary-action" type="button" onClick={() => setNotificationOpen(false)}>Save settings</button></div>
          </section>
        </div>
      )}

      {activeAlert && (
        <section className={`live-reminder-alert${isImportant(activeAlert) ? " important" : ""}`} role="alertdialog" aria-label="AAI Q reminder">
          <button className="alert-close" type="button" onClick={() => setActiveAlert(null)} aria-label="Close reminder">×</button>
          <p>{activeAlert.mediaId && notificationPreferences.video ? "Video message" : isImportant(activeAlert) ? "Important message" : "AAI Q reminder"}</p>
          <h2>{activeAlert.title}</h2>
          <span>{friendlyTime(activeAlert.scheduledAt)} · {activeAlert.sourceLabel}</span>
          {activeAlert.mediaId && notificationPreferences.video && <button className="alert-video-button" type="button" onClick={() => {
            const memory = memories.find((item) => item.id === activeAlert.mediaId);
            if (memory) setPlayingMemory(memory);
          }}>▶ Play video message</button>}
          {activeAlert.id === "notification-preview" ? <button className="alert-done-button" type="button" onClick={() => setActiveAlert(null)}>Close preview</button> : <><div className="alert-snooze-row">{notificationPreferences.snoozes.map((minutes) => <button key={minutes} type="button" onClick={() => void snoozeReminder(activeAlert, minutes)}>Snooze {minutes}m</button>)}</div><button className="alert-done-button" type="button" onClick={() => void updateStatus(activeAlert, "done")}>Mark done</button></>}
        </section>
      )}

      {videoOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeVideoRecorder}>
          <section className="video-sheet" role="dialog" aria-modal="true" aria-labelledby="video-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="video-sheet-heading"><div><p>Video memory</p><h2 id="video-title">Record for your future self</h2></div><button type="button" onClick={closeVideoRecorder} aria-label="Close">×</button></div>
            <div className="video-stage">
              {videoUrl ? <video src={videoUrl} controls playsInline /> : <video ref={previewRef} muted playsInline />}
              {recording && <span className="recording-badge"><i />Recording</span>}
            </div>
            {!videoBlob ? <button className={`record-button${recording ? " stop" : ""}`} type="button" onClick={recording ? stopRecording : beginRecording}><i />{recording ? "Stop recording" : "Start recording"}</button> : (
              <div className="video-form"><label><span>Memory title</span><input value={videoTitle} onChange={(event) => setVideoTitle(event.target.value)} /></label><label><span>Bring it back on</span><input type="datetime-local" value={videoWhen} onChange={(event) => setVideoWhen(event.target.value)} /></label><div><button type="button" className="secondary-action" onClick={openVideoRecorder}>Record again</button><button type="button" className="primary-action" onClick={saveVideoMemory} disabled={busy === "video"}>{busy === "video" ? "Saving…" : "Save memory"}</button></div></div>
            )}
          </section>
        </div>
      )}

      {playingMemory && <div className="modal-backdrop" role="presentation" onMouseDown={() => setPlayingMemory(null)}><section className="playback-sheet" role="dialog" aria-modal="true" aria-label={playingMemory.title} onMouseDown={(event) => event.stopPropagation()}><button type="button" onClick={() => setPlayingMemory(null)} aria-label="Close">×</button><video src={playingMemory.url} controls autoPlay playsInline /><div><p>Video memory</p><h2>{playingMemory.title}</h2><span>Saved {friendlyDay(playingMemory.createdAt)}</span></div></section></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
