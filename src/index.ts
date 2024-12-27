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
    } else if (url.pathname === "/do-translate") {
      // Extract the security code from the query parameters
      const securityCode = url.searchParams.get("code");

      // Check if the provided security code matches the one in the environment variable
      if (!securityCode || securityCode !== env.SECURITY_CODE) {
        return addCorsHeaders(
          new Response("Unauthorized: Invalid security code.", { status: 403 })
        );
      }

      // Extract the 'id' query parameter
      const idParam = url.searchParams.get("id");
      const id = idParam ? parseInt(idParam, 10) : undefined; // Convert to number if provided

      if (idParam && isNaN(id)) {
        // Return an error response if the provided ID is not a valid number
        return addCorsHeaders(new Response("Invalid ID parameter.", { status: 400 }));
      }

      const response = await fetchUntranslatedRecord(env.DB, env, id); // Pass the ID (or undefined if not provided)
      return addCorsHeaders(response);
    // } else if (url.pathname === "/send-telegram") {
    //   const response = await sendTelegramPost(env.DB, env);
    //   return addCorsHeaders(response);
    }  else if (url.pathname.startsWith("/catalan_news/")) {
      const response = await fetchNewsDetail(url.pathname, env.DB);
      return addCorsHeaders(response);
    } else if (url.pathname === "/sitemap.xml") { // New sitemap route
      const response = await generateSitemap(env.DB);
      return response; // No need for CORS headers on sitemap
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
      await sendTelegramPost(env.DB, env);
    } catch (error) {
      console.error("Error in scheduled event:", error);
    }
  },
};

async function sendTelegramPost(db: D1Database, env: Env): Promise<Response> {
  try {
    // Fetch a row with `telegram_data` set to null
    const result = await db.prepare("SELECT * FROM catalan_news WHERE telegram_data IS NULL LIMIT 1").first();
    if (!result) {
      return new Response("No records to send to Telegram", { status: 200 });
    }

    // Extract required data
    const { id, title_fa,published_date, content_telegram, slug_url, photo } = result;

    // Construct the URL of the page
    const pageUrl = `https://8log.ir/catalan_news/?id=${id}&title=${slug_url}`;

    // Construct the caption
    const caption = `
    ${content_telegram}

    ${published_date}
    `;

    // Send message with photo and inline keyboard to Telegram group
    const telegramResponse = await sendPhotoWithButtonToTelegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, photo, caption, pageUrl);

    if (!telegramResponse.ok) {
      console.error("Failed to send message to Telegram", telegramResponse);
      return new Response("Failed to send message to Telegram", { status: 500 });
    }

    // Update the `telegram_data` field in the database
    await db
      .prepare("UPDATE catalan_news SET telegram_data = ? WHERE id = ?")
      .bind(JSON.stringify(telegramResponse), id)
      .run();

    return new Response("Message sent and database updated", { status: 200 });
  } catch (error) {
    console.error("Error in sendTelegramPost:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

async function sendPhotoWithButtonToTelegram(botToken: string, chatId: string, photoUrl: string, caption: string, buttonUrl: string) {
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const payload = {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "مشاهده بیشتر", url: buttonUrl }
        ]
      ]
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return response.json();
}

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
    const result = await db.prepare(`SELECT * FROM catalan_news WHERE is_translated = 1 ORDER BY id DESC LIMIT 20;`).all();
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
async function fetchUntranslatedRecord(db: D1Database, env: Env, id?: number): Promise<Response> {
  console.log("fetchUntranslatedRecord started");

  // Modify query to allow filtering by ID if provided
  const query = id
    ? `SELECT * FROM catalan_news WHERE id = ? AND is_crawled = 1 LIMIT 1;`
    : `SELECT * FROM catalan_news WHERE is_translated = 0 AND is_crawled = 1 AND chat_gpt IS NULL LIMIT 1;`;

  const result = id
    ? await db.prepare(query).bind(id).first()
    : await db.prepare(query).first();

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
        `UPDATE catalan_news
         SET
           title_fa = ?,
           content_fa = ?,
           slug_url = ?,
           seo_title = ?,
           seo_description = ?,
           seo_keywords = ?,
           summary = ?,
           is_translated = 1,
           published_at = ?,
           content_telegram = ?
         WHERE id = ?;`
      )
      .bind(
        translated.title_fa,
        translated.content_fa,
        translated.slug_url,
        translated.seo_title,
        translated.seo_description,
        translated.seo_keywords,
        translated.seo_description,
        new Date().toISOString(), // Current date and time in ISO 8601 format
        translated.content_telegram,
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

async function translateRecordWithChatGPT(record, db, env) {
  // Step 1: Translate title and content
  const translationPrompt = `
  Translate the following title and content into Persian. The content_fa field should include the translated content in Persian, summarized to be informal, engaging, and suitable as news for a general audience. Use appropriate HTML tags such as <p>, <h2>, <strong>, or others where necessary to enhance readability.

  Return the result as a JSON object with the following fields:
  - title_fa: The translated title in Persian.
  - content_fa: The translated and summarized content in Persian, written informally like news for a general audience and formatted in HTML (limited to 3000 characters if necessary).

  Ensure the response is valid JSON with no extra text or formatting. Here is the text:
  ${record.title_en}
  ${record.content_en}
  `;


  const translationResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a translator. Always respond with valid JSON and nothing else." },
        { role: "user", content: translationPrompt },
      ],
      temperature: 1,
    }),
  });
  const clonedResponse = translationResponse.clone();
  const rawResponse = await clonedResponse.text();
  await db
    .prepare(`UPDATE catalan_news SET chat_gpt = ? WHERE id = ?;`)
    .bind(
      rawResponse,
      record.id
    )
    .run();

  const translationData = await translationResponse.json();
  if (!translationData.choices || !translationData.choices[0].message) {
    throw new Error("Failed to parse ChatGPT translation response.");
  }

  const translated = JSON.parse(translationData.choices[0].message.content);

  // Save the initial translation result to the database
  await db
    .prepare(`UPDATE catalan_news SET title_fa = ?, content_fa = ?, chat_gpt = ? WHERE id = ?;`)
    .bind(
      translated.title_fa,
      translated.content_fa,
      JSON.stringify({ title_fa: translated.title_fa, content_fa: translated.content_fa }),
      record.id
    )
    .run();

  // Step 2: Generate SEO, Telegram post, and summary based on translated content
  const seoPrompt = `
  Based on the following Persian title and content, generate the following fields:
  - seo_title: A concise and relevant SEO title in Persian.
  - seo_description: A brief and descriptive SEO description in Persian.
  - seo_keywords: A list of relevant keywords in Persian, comma-separated.
  - content_telegram: A post optimized for Telegram, using an engaging tone, emojis, and icons to attract attention.

  Ensure the response is valid JSON with no extra text or formatting. Here is the text:
  ${translated.title_fa}
  ${translated.content_fa}
  `;

  const seoResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are an SEO expert. Always respond with valid JSON and nothing else." },
        { role: "user", content: seoPrompt },
      ],
      temperature: 1,
    }),
  });
  const clonedSeoResponse = seoResponse.clone();
  const rawSeoResponse = await clonedSeoResponse.text();
  await db
    .prepare(`UPDATE catalan_news SET chat_gpt = ? WHERE id = ?;`)
    .bind(
      rawSeoResponse,
      record.id
    )
    .run();

  const seoData = await seoResponse.json();
  if (!seoData.choices || !seoData.choices[0].message) {
    throw new Error("Failed to parse ChatGPT SEO response.");
  }

  const seoFields = JSON.parse(seoData.choices[0].message.content);

  // Combine all fields and save to the database
  const combinedData = { ...translated, ...seoFields };

  await db
    .prepare(
      `UPDATE catalan_news SET chat_gpt = ?, is_translated = 1 WHERE id = ?;`
    )
    .bind(
      JSON.stringify(combinedData),
      record.id
    )
    .run();

  return combinedData;
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


async function generateSitemap(db: D1Database): Promise<Response> {
  try {
    const result = await db.prepare(`SELECT * FROM catalan_news WHERE is_translated = 1 ORDER BY id DESC;`).all();
    const rows = result.results;

    let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    for (const item of rows) {
      try {

        const url = `https://8log.ir/catalan_news?id=`+item.id+`&amp;title=`+item.slug_url;

        if (url) {
          sitemap += `
  <url>
    <loc>${url}</loc>`;

          if (item.published_date) {
            try {
              const dateObj = new Date(item.published_date);
              if (!isNaN(dateObj)) {
                const formattedDate = dateObj.toISOString().split("T")[0];
                sitemap += `
    <lastmod>${formattedDate}</lastmod>`;
              } else {
                console.error(`Invalid date: ${item.published_date} for ${url}`);
              }
            } catch (dateError) {
              console.error(`Date parse error: ${dateError} for ${url}`);
            }
          }
           sitemap += `
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }
      } catch (itemError) {
        console.error(`Item error: ${itemError} for item id: ${item.id}`);
      }
    }

    sitemap += `
</urlset>`;

    return new Response(sitemap, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Sitemap generation error:", error);
    return new Response("Error generating sitemap", { status: 500 });
  }
}


// Define Env interface for Worker environment bindings
interface Env {
  DB: D1Database;
  OPENAI_API_KEY: string;
}
