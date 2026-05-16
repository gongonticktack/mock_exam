// ======================================
// functions/api/ocr/extract.js
// ======================================
// Cloudflare Pages Function として動くOCR APIです。
//
// スマホ画面で撮影した画像を受け取り、Cloudflare Workers AIのVisionモデルへ渡します。
// 返ってきた文章をJSONとして解釈し、問題文・選択肢・解説候補に整えてブラウザへ返します。
//
// 重要:
// - 画像はR2やDBへ保存しません。
// - Responseには cache-control: no-store を付け、キャッシュされにくくしています。
// - wrangler.jsonc の ai binding により env.AI.run() が使えます。

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function jsonResponse(body, status = 200) {
  // APIレスポンスをJSON形式に統一する小さなヘルパーです。
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function arrayBufferToBase64(buffer) {
  // Workers AIの画像入力はdata URL形式を受け取れるため、
  // アップロードされた画像バイナリをBase64文字列へ変換します。
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function extractModelText(result) {
  // Workers AIモデルによってレスポンス形状が少し違うことがあります。
  // どの形でも最終的なテキストだけ取り出せるようにしています。
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string") return result.response;

  const choice = result.choices?.[0];
  if (typeof choice?.message?.content === "string") {
    return choice.message.content;
  }
  if (Array.isArray(choice?.message?.content)) {
    return choice.message.content
      .map((item) => item.text || "")
      .join("\n");
  }

  return "";
}

function parseJsonFromText(text) {
  // モデルには「JSONだけ返して」と指示していますが、まれに前後に説明文が混じります。
  // まずそのままJSON.parseし、失敗したら {...} 部分だけ抜き出して再挑戦します。
  const trimmed = String(text || "").trim();

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw error;
    }
    return JSON.parse(match[0]);
  }
}

function normalizeCandidate(candidate) {
  // モデルの出力を、画面側が扱いやすい安全な形へ整えます。
  // choicesが配列でなければ空配列にし、空文字は取り除きます。
  return {
    question: String(candidate?.question || "").trim(),
    choices: Array.isArray(candidate?.choices)
      ? candidate.choices.map((choice) => String(choice || "").trim()).filter(Boolean)
      : [],
    explanation: String(candidate?.explanation || "").trim()
  };
}

async function runVisionModel(env, model, imageUrl) {
  // Visionモデルへ投げるプロンプトです。
  // 「問題文」「選択肢」「解説候補」をJSONで返すように強く指示しています。
  const prompt = [
    "You are extracting certification exam questions from a camera image.",
    "Read all visible Japanese and English text.",
    "Return strict JSON only. Do not include markdown.",
    "Schema:",
    "{\"questions\":[{\"question\":\"string\",\"choices\":[\"string\"],\"explanation\":\"string\"}],\"rawText\":\"string\"}",
    "Rules:",
    "- Extract multiple questions if multiple are visible.",
    "- Preserve Japanese text.",
    "- Put only answer choices in choices.",
    "- Do not guess the correct answer.",
    "- If explanation is not visible, use an empty string."
  ].join("\n");

  return env.AI.run(model, {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ],
    temperature: 0,
    max_tokens: 2048
  });
}

export async function onRequestPost(context) {
  // POST /api/ocr/extract の本体です。
  // Pages Functionでは、この関数名にするとPOSTリクエストを処理できます。
  const { request, env } = context;

  if (!env.AI) {
    return jsonResponse({ error: "Workers AI binding is not configured." }, 500);
  }

  const formData = await request.formData();
  const image = formData.get("image");

  if (!image || typeof image === "string") {
    return jsonResponse({ error: "image file is required." }, 400);
  }

  if (!ALLOWED_TYPES.has(image.type)) {
    return jsonResponse({ error: "unsupported image type." }, 400);
  }

  if (image.size > MAX_IMAGE_BYTES) {
    return jsonResponse({ error: "image must be 5MB or smaller." }, 400);
  }

  const buffer = await image.arrayBuffer();
  const imageUrl = `data:${image.type};base64,${arrayBufferToBase64(buffer)}`;
  const models = [
    // まず高精度なGemma 4を試し、失敗した場合だけGemma 3へフォールバックします。
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/google/gemma-3-12b-it"
  ];

  let lastError = null;
  let modelText = "";
  let usedModel = "";

  for (const model of models) {
    try {
      const result = await runVisionModel(env, model, imageUrl);
      modelText = extractModelText(result);
      usedModel = model;
      if (modelText) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!modelText) {
    console.error("OCR model failed:", lastError);
    return jsonResponse({ error: "OCR model failed." }, 502);
  }

  try {
    const parsed = parseJsonFromText(modelText);
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.map(normalizeCandidate).filter((item) => item.question || item.choices.length)
      : [];

    return jsonResponse({
      questions,
      rawText: String(parsed.rawText || ""),
      model: usedModel
    });
  } catch (error) {
    return jsonResponse({
      questions: [],
      rawText: modelText,
      model: usedModel,
      warning: "Model response was not valid JSON."
    });
  }
}
