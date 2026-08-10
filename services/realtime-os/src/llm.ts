import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { config } from "./config.js";
import { extractedIntentSchema, type ExtractedIntent, type IntakeRequest } from "./contracts.js";
import { assertSafeMediaUrl, redactForModel } from "./security.js";
import { downloadAudio, videoFrames } from "./media.js";
import { hospitalityAiIntentSystemPrompt } from "./constants/aiPrompts.js";

const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 45_000, maxRetries: 3 });

export async function transcribeAudioMedia(url: string, contentType: string): Promise<string> {
  const transcript = await client.audio.transcriptions.create({
    model: "gpt-4o-mini-transcribe",
    file: await downloadAudio(url, contentType, true),
  });
  return redactForModel(transcript.text).slice(0, 20_000);
}

async function inputContent(request: IntakeRequest, inlineImages: string[] = []): Promise<OpenAI.Responses.ResponseInputContent[]> {
  const history = request.chat_history_chunk?.map((item) => `${item.timestamp ?? ""} ${item.author}: ${item.text}`).join("\n") ?? "";
  const text = redactForModel([request.text ?? "", history].filter(Boolean).join("\n")).slice(0, 30_000);
  const content: OpenAI.Responses.ResponseInputContent[] = [{ type: "input_text", text: text || "Analyze the attached operational media." }];
  for (const image of inlineImages) content.push({ type: "input_image", image_url: image, detail: "high" });
  for (const url of request.media_urls ?? []) {
    const safe = assertSafeMediaUrl(url);
    if (/\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.test(new URL(safe).pathname)) content.push({ type: "input_image", image_url: safe, detail: "high" });
    else {
      for (const frame of await videoFrames(safe)) content.push({ type: "input_image", image_url: frame, detail: "high" });
    }
  }
  if (request.audio_url) {
    const transcript = await client.audio.transcriptions.create({ model: "gpt-4o-mini-transcribe", file: await downloadAudio(request.audio_url) });
    content.push({ type: "input_text", text: `Voice memo transcript:\n${redactForModel(transcript.text).slice(0, 20_000)}` });
  }
  return content;
}

export async function extractIntent(request: IntakeRequest, timezone: string, inlineImages: string[] = []): Promise<ExtractedIntent> {
  const response = await client.responses.parse({
    model: config.OPENAI_MODEL,
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: hospitalityAiIntentSystemPrompt(timezone) },
        ...await inputContent(request, inlineImages),
      ],
    }],
    text: { format: zodTextFormat(extractedIntentSchema, "hospitality_intent") },
  });
  if (!response.output_parsed) throw new Error("The model did not return a valid structured extraction.");
  return response.output_parsed;
}
