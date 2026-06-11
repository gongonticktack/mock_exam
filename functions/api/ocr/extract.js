// ======================================
// functions/api/ocr/extract.js
// ======================================
// Cloudflare Pages Function として動くOCR APIです。
//
// カメラで撮影した画像を受け取り、Cloudflare Workers AIのVisionモデルへ渡します。
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

/**
 * API の結果を JSON レスポンスとして返します。
 *
 * @param {any} body - この関数に渡す値。
 * @param {number} status  - この関数に渡す値。
 * @returns {HTMLElement} 処理結果。
 */
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

/**
 * 画像の ArrayBuffer を base64 文字列へ変換します。
 *
 * @param {any} buffer - この関数に渡す値。
 * @returns {string} 処理結果。
 */
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

/**
 * AIモデルの応答から本文テキスト部分を取り出します。
 *
 * @param {any} result - この関数に渡す値。
 * @returns {string} 処理結果。
 */
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

/**
 * AI応答の中から JSON 部分を探してパースします。
 *
 * @param {string} text - この関数に渡す値。
 * @returns {string} 処理結果。
 */
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

/**
 * OCR候補の問題文、選択肢、解説を扱いやすい形へ整えます。
 *
 * @param {Event} candidate - この関数に渡す値。
 * @returns {object} 処理結果。
 */
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

/**
 * OCRモデルへ渡す、問題抽出用の指示文を作ります。
 *
 * @returns {string} 処理結果。
 */
function buildOcrPrompt() {
  // Visionモデルへ投げるプロンプトです。
  // 「問題文」「選択肢」「解説候補」をJSONで返すように強く指示しています。
  return [
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
}

/**
 * 画像とプロンプトを Cloudflare Workers AI に送り、OCR結果を取得します。
 *
 * @param {any} env - この関数に渡す値。
 * @param {string} model - この関数に渡す値。
 * @param {any} imageBytes - この関数に渡す値。
 * @param {any} imageBase64 - この関数に渡す値。
 * @param {any} imageUrl - この関数に渡す値。
 * @returns {Promise<void>} 処理結果。
 */
async function runVisionModel(env, model, imageBytes, imageBase64, imageUrl) {
  const prompt = buildOcrPrompt();
  const attempts = [
    {
      name: "image-bytes",
      input: {
        messages: [{ role: "user", content: prompt }],
        image: imageBytes,
        temperature: 0,
        max_tokens: 2048
      }
    },
    {
      name: "image-base64",
      input: {
        messages: [{ role: "user", content: prompt }],
        image: imageBase64,
        temperature: 0,
        max_tokens: 2048
      }
    },
    {
      name: "image-url",
      input: {
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
      }
    }
  ];

  const errors = [];

  for (const attempt of attempts) {
    try {
      const result = await env.AI.run(model, attempt.input);
      const text = extractModelText(result);
      if (text) {
        return {
          text,
          attempt: attempt.name
        };
      }
      errors.push(`${attempt.name}: empty response`);
    } catch (error) {
      errors.push(`${attempt.name}: ${error?.message || String(error)}`);
    }
  }

  const error = new Error(`All OCR payload attempts failed for ${model}.`);
  error.details = errors;
  throw error;
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
  const imageBytes = [...new Uint8Array(buffer)];
  const imageBase64 = arrayBufferToBase64(buffer);
  const imageUrl = `data:${image.type};base64,${imageBase64}`;
  const models = [
    // まず高精度なGemma 4を試し、失敗した場合だけGemma 3へフォールバックします。
    "@cf/google/gemma-4-26b-a4b-it",
    "@cf/google/gemma-3-12b-it",
    "@cf/meta/llama-3.2-11b-vision-instruct"
  ];

  const failures = [];
  let modelText = "";
  let usedModel = "";
  let usedAttempt = "";

  for (const model of models) {
    try {
      const result = await runVisionModel(env, model, imageBytes, imageBase64, imageUrl);
      modelText = result.text;
      usedModel = model;
      usedAttempt = result.attempt;
      if (modelText) break;
    } catch (error) {
      failures.push({
        model,
        message: error?.message || String(error),
        details: error?.details || []
      });
    }
  }

  if (!modelText) {
    console.error("OCR model failed:", failures);
    return jsonResponse({
      error: "OCR model failed.",
      details: failures
    }, 502);
  }

  try {
    const parsed = parseJsonFromText(modelText);
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.map(normalizeCandidate).filter((item) => item.question || item.choices.length)
      : [];

    return jsonResponse({
      questions,
      rawText: String(parsed.rawText || ""),
      model: usedModel,
      attempt: usedAttempt
    });
  } catch (error) {
    return jsonResponse({
      questions: [],
      rawText: modelText,
      model: usedModel,
      attempt: usedAttempt,
      warning: "Model response was not valid JSON."
    });
  }
}
