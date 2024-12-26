const FEED_URL = "https://politepol.com/fd/C8llp5gJot31.json";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      const response = await fetchRecords(env.DB);
      return addCorsHeaders(response);
    // } else if (url.pathname === "/load-feed") {
    //   const response = await loadFeedAndSaveToDB(env.DB);
    //   return addCorsHeaders(response);
    // } else if (url.pathname === "/do-translate") {
    //   const response = await fetchUntranslatedRecord(env.DB, env);
    //   return addCorsHeaders(response);
    } else if (url.pathname.startsWith("/catalan_news/")) {
      const response = await fetchNewsDetail(url.pathname, env.DB);
      return addCorsHeaders(response);
    } else if (request.method === "OPTIONS") {
      return handleOptions();
    } else {
      return addCorsHeaders(new Response("Not Found", { status: 404 }));
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    try {
      await loadFeedAndSaveToDB(env.DB);
      await fetchUntranslatedRecord(env.DB, env);
    } catch (error) {
      console.error("Error in scheduled event:", error);
    }
  },
};

// Fetch a single news item based on ID
async function fetchNewsDetail(path: string, db: D1Database): Promise<Response> {

  try {
    const match = path.match(/\/catalan_news\/([a-zA-Z0-9]+)/);
    if (!match) {
      return new Response("Invalid URL format", { status: 400 });
    }


    const id = match[1];

    // Build the query string dynamically
    const query = `SELECT * FROM catalan_news WHERE id = '${id}' AND is_translated = 1;`;

    const result = await db.prepare(query).first();

    if (!result) {
      return new Response("News item not found", { status: 404 });
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching news detail:", error);
    return new Response(`Error fetching news detail: ${error.message}`, {
      status: 500,
    });
  }
}




// Add CORS headers to the response
function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", "*"); // Allow all origins
  newHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"); // Allow all methods
  newHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization"); // Allow specific headers
  newHeaders.set("Access-Control-Max-Age", "86400"); // Cache preflight response for 24 hours

  return new Response(response.body, {
    ...response,
    headers: newHeaders,
  });
}

// Handle OPTIONS preflight requests
function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}

// Fetch all records from the database
async function fetchRecords(db: D1Database): Promise<Response> {

  try {
    const result = await db.prepare(`SELECT * FROM catalan_news WHERE is_translated = 1 ORDER BY id DESC;`).all();
    const rows = result.results;

    if (!rows || rows.length === 0) {
      return new Response("No records found.", { status: 404 });
    }

    return new Response(JSON.stringify(rows), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching records:", error);
    return new Response(`Error fetching records: ${error.message}`, {
      status: 500,
    });
  }
}

// Load the feed and save data to the database
async function loadFeedAndSaveToDB(db: D1Database): Promise<Response> {
  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.statusText}`);
    }

    const feedData = await response.json();
    const items = feedData.items || [];

    let insertedCount = 0;
    for (const item of items) {
      try {
        const urlId = await generateHashedId(item.url); // Generate hash for the URL
        await db
          .prepare(`INSERT INTO catalan_news (url_id, source_url) VALUES (?, ?);`)
          .bind(urlId, item.url)
          .run();
        insertedCount++;
      } catch (error) {
        if (error.message.includes("UNIQUE constraint failed")) {
          console.log(`Duplicate record skipped for URL: ${item.url}`);
        } else {
          console.error(`Error inserting record for URL: ${item.url}`, error);
        }
      }
    }

    return new Response(`Feed processed successfully. Inserted ${insertedCount} new records.`);
  } catch (error) {
    console.error("Error loading feed:", error);
    return new Response(`Error loading feed: ${error.message}`, { status: 500 });
  }
}

// Fetch an untranslated record and translate it
async function fetchUntranslatedRecord(db: D1Database, env: Env): Promise<Response> {
  console.log("fetchUntranslatedRecord started");

  const result = await db.prepare(`SELECT * FROM catalan_news WHERE is_translated = 0 AND is_crawled = 1 AND chat_gpt IS NULL LIMIT 1;`).first();

  if (!result) {
    return new Response("No untranslated records found.", { status: 404 });
  }

  try {
    const translated = await translateRecordWithChatGPT(result, db, env);

    const slug = generatePersianSlug(translated.seo_title);
    translated.slug_url = slug;



    if (translated) {
      await db
        .prepare(
          `UPDATE catalan_news SET title_fa = ?, content_fa = ?, slug_url = ?, seo_title = ?, seo_description = ?, seo_keywords = ?, summary = ?, is_translated = 1 WHERE id = ?;`
        )
        .bind(
          translated.title_fa,
          translated.content_fa,
          translated.slug_url,
          translated.seo_title,
          translated.seo_description,
          translated.seo_keywords,
          translated.summary,
          result.id
        )
        .run();

      return new Response("Translation completed and record updated.", { status: 200 });
    } else {
      return new Response("Translation failed.", { status: 500 });
    }
  } catch (error) {
    console.error("Error fetching untranslated record:", error);
    return new Response(`Error fetching untranslated record: ${error.message}`, {
      status: 500,
    });
  }
}

function generatePersianSlug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[\s\ـ]+/g, "-") // Replace spaces and dashes with a single dash
    .replace(/[^ء-ي۰-۹a-z0-9-]+/g, ""); // Remove non-Persian, non-English, and non-numeric characters
}


// Translate a record using ChatGPT
async function translateRecordWithChatGPT(record, db, env): Promise<any> {

  const prompt = `
  Translate the following text into Persian and create a short, friendly, and engaging summary suitable for a Telegram post. Return the result as a JSON object with the following fields:
  - title_fa
  - content_fa (formatted in HTML with <p>, <h2>, <strong>, and other tags for readability, and limited to 3000 characters if necessary)
  - seo_title
  - seo_description
  - seo_keywords
  - summary (very short and friendly, written in an engaging tone for Telegram)

  Ensure the response is valid JSON with no extra text or formatting. If the content exceeds 3000 characters, shorten it while maintaining readability and context. Here is the text:
  ${record.title_en}
  ${record.content_en}
  `;


  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo", // Using the cheaper version
      messages: [
        { role: "system", content: "You are a translator. Always respond with valid JSON and nothing else." },
        { role: "user", content: prompt },
      ],
      temperature: 1,
      // max_completion_tokens: 4096,
      response_format: {
        type: "json_object",
      },
    }),
  });

  const clonedResponse = response.clone();
  const rawResponse = await clonedResponse.text();
  // console.log("rawResponse:", rawResponse);
  // console.log("Response Status:", clonedResponse.status);

  await db
    .prepare(
      `UPDATE catalan_news SET chat_gpt = ? WHERE id = ?;`
    )
    .bind(
      rawResponse,
      record.id
    )
    .run();

  const data = await response.json();

  if (data.choices && data.choices[0].message) {
    return JSON.parse(data.choices[0].message.content);
  } else {
    throw new Error("Failed to parse ChatGPT response.");
  }
}

// Generate a hashed ID for a URL
async function generateHashedId(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashBase64 = btoa(String.fromCharCode(...hashArray))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return hashBase64.slice(0, 16); // Truncate for uniqueness
}

// Define Env interface for Worker environment bindings
interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
}
