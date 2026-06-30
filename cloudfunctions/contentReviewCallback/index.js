const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "text/plain; charset=utf-8" },
    body
  };
}

function parseXmlValue(xml, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i").exec(xml);
  if (cdata) return cdata[1];
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i").exec(xml);
  return plain ? plain[1] : "";
}

function parseBody(event) {
  const rawBody = event && event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : (event && event.body) || "";
  if (rawBody && typeof rawBody === "object") return rawBody;
  const text = trimString(rawBody);
  if (!text) return {};
  if (text.startsWith("{")) return JSON.parse(text);
  return {
    trace_id: parseXmlValue(text, "TraceId") || parseXmlValue(text, "trace_id"),
    result: {
      suggest: parseXmlValue(text, "Suggest") || parseXmlValue(text, "suggest")
    }
  };
}

function verifySignature(query) {
  const token = trimString(process.env.CONTENT_REVIEW_CALLBACK_TOKEN);
  if (!token) return false;
  const timestamp = trimString(query.timestamp);
  const nonce = trimString(query.nonce);
  const signature = trimString(query.signature);
  if (!timestamp || !nonce || !signature) return false;
  const expected = [token, timestamp, nonce]
    .sort()
    .join("");
  const digest = crypto.createHash("sha1").update(expected).digest("hex");
  return digest === signature;
}

exports.main = async (event = {}) => {
  const query = event.queryStringParameters || event.query || {};
  if (!verifySignature(query)) {
    return response(403, "forbidden");
  }

  if (String(event.httpMethod || event.requestContext && event.requestContext.httpMethod).toUpperCase() === "GET") {
    return response(200, trimString(query.echostr));
  }

  let callback;
  try {
    callback = parseBody(event);
  } catch (error) {
    return response(400, "invalid body");
  }

  const callbackSecret = trimString(process.env.CONTENT_REVIEW_CALLBACK_SECRET);
  if (!callbackSecret) {
    return response(500, "callback secret missing");
  }

  const result = await cloud.callFunction({
    name: "yidianApi",
    data: {
      domain: "contentReview",
      action: "handleMediaCallback",
      requestId: `content-review-${Date.now()}`,
      payload: {
        callbackSecret,
        callback
      }
    }
  });
  const data = result && result.result;
  if (!data || data.success !== true) {
    console.error("[contentReviewCallback] processing failed", data);
    return response(500, "failed");
  }

  return response(200, "success");
};
