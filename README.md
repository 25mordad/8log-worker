# Cloudflare Worker for Catalan News Translation & Telegram Integration

## Overview
This project is a Cloudflare Worker designed to:
- Fetch and translate news articles from an external feed.
- Store translated news articles in a database.
- Provide a public API to fetch translated articles.
- Send translated news articles to a Telegram channel.
- Generate a `sitemap.xml` for SEO optimization.

## Features
- **Fetch News Feed**: Loads news articles from an external RSS feed and saves them in the database.
- **Translation**: Automatically translates articles from English to Persian using OpenAI's GPT API.
- **API Endpoints**:
  - `/` - Fetches the latest translated news articles.
  - `/do-translate` - Translates a specific article by ID (secured by a security code).
  - `/catalan_news/{id}` - Fetches details of a specific news article.
  - `/sitemap.xml` - Generates an XML sitemap for SEO purposes.
- **Telegram Integration**: Automatically sends translated articles to a Telegram channel with formatted captions and links.
- **Scheduled Tasks**: Periodically processes new news articles and posts them to Telegram.
- **CORS Handling**: Allows cross-origin access for API responses.

## API Endpoints
### `GET /`
Fetches the latest 20 translated news articles from the database.

### `GET /do-translate?code={SECURITY_CODE}&id={ARTICLE_ID}`
Translates a specific article and updates the database. Requires a valid security code.

### `GET /catalan_news/{id}`
Fetches details of a specific translated article.

### `GET /sitemap.xml`
Generates an XML sitemap containing all translated articles for SEO.

## Environment Variables
| Variable | Description |
|----------|-------------|
| `DB` | Cloudflare D1 Database for storing news articles. |
| `SECURITY_CODE` | Security key required for triggering translations. |
| `SITE_URL` | The base URL for linking to news articles. |
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token for sending messages. |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for posting news. |
| `TELEGRAM_CHANNEL_LINK` | Link to the Telegram channel. |
| `OPENAI_API_KEY` | API key for OpenAI GPT translations. |

## Scheduled Tasks
The worker runs scheduled tasks to:
1. Fetch and process untranslated news articles.
2. Send translated news articles to Telegram.

## Deployment
1. Deploy the Cloudflare Worker using the `wrangler` CLI.
2. Set up environment variables in Cloudflare.
3. Ensure the D1 database is initialized with the required schema.

## License
MIT License.
