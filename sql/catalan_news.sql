-- Drop the table if it already exists to avoid conflicts
DROP TABLE IF EXISTS catalan_news;


CREATE TABLE catalan_news (
    id INTEGER PRIMARY KEY AUTOINCREMENT, -- Auto-incrementing primary key
    url_id TEXT NOT NULL UNIQUE, -- Unique identifier for the URL
    source_url TEXT NOT NULL, -- Original source URL
    is_crawled BOOLEAN DEFAULT FALSE, -- Flag to indicate if the content is crawled
    title_en TEXT, -- Title in English
    content_en TEXT, -- Content in English
    photo TEXT, -- URL or path to the associated photo
    is_translated BOOLEAN DEFAULT FALSE, -- Flag to indicate if the content is translated
    summary TEXT, -- Summary of the content
    title_fa TEXT, -- Title in Persian (Farsi)
    content_fa TEXT, -- Content in Persian (Farsi)
    slug_url TEXT UNIQUE, -- SEO-friendly URL slug
    seo_title TEXT, -- SEO title
    seo_description TEXT, -- SEO description
    seo_keywords TEXT, -- SEO keywords (comma-separated)
    telegram_data TEXT, -- Data related to Telegram posts (stored as JSON string)
    published_date TEXT, -- Data related to Telegram posts (stored as JSON string)
    chat_gpt TEXT, -- Data related to Telegram posts (stored as JSON string)
    published_at DATE, --
    content_telegram TEXT --
);

-- Add an index to url_id for faster search
CREATE INDEX idx_url_id ON catalan_news (url_id);
