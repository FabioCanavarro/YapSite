# YapSite — AI-Powered Voice & Text Journal

> **Note**: YapSite is an AI-assisted side project.

YapSite is a voice and text journaling platform. Speak or type your raw thoughts, and YapSite automatically transcribes, cleans up grammar, categorizes, tracks mood dynamics, builds a persistent personal Knowledge Base, and visualizes connections through interactive Mind Graphs.

---

## Key Features

- **Voice & Text Journaling**: Record audio directly in the browser with client-side compression and server-side pure JS WAV/MP3 chunking for large files.
- **Multi-Tier AI Fallback Engine**:
  - **Transcription**: Powered by Groq Whisper (`whisper-large-v3`).
  - **Semantic Analysis**: Multi-tier fallback architecture:
    1. **Primary**: Hack Club AI (`gpt-4o-mini`)
    2. **Secondary**: Groq (`llama-3.3-70b-versatile`)
    3. **Free Fallback**: OpenRouter Free Tier (`google/gemini-2.0-flash-lite`, `meta-llama/llama-3.3-70b`, `deepseek/deepseek-r1`, `qwen-2.5-coder`, `mistral-7b`)
- **Personal Knowledge Base**: Automatically extracts and compiles long-term facts, strengths, growth areas, relations, and scenarios into a contextual AI knowledge base.
- **Interactive Mind Graph**: Visually map connections between journal themes, emotional moods, categories, and entries.
- **Hack Club CDN Storage**: Voice recordings are offloaded to Hack Club CDN v4 (`/api/v4/upload`) to preserve database storage, complete with live quota monitoring.
- **Automatic & Periodic Retries**: 12-hour client background retries and daily Vercel Cron (`0 0 * * *`) at `/api/cron/retry-pending` to automatically recover entries from temporary AI downtime or credit exhaustion.
- **Dynamic GSAP Themes**: Animated color palette interpolation featuring Mocha, Macchiato, Frappé, Latte Light, Neon Cyberpunk, and Forest Emerald themes.
- **PWA & Offline Sync**: Full Progressive Web App support with offline queueing and background sync when connection resumes.

---

## Technology Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack) & [React 19](https://react.dev/)
- **Styling**: Vanilla CSS & [Tailwind CSS v4](https://tailwindcss.com/)
- **Animations**: [GSAP 3](https://greensock.com/gsap/) & [Framer Motion](https://www.framer.com/motion/)
- **Database & Auth**: [Supabase](https://supabase.com/)
- **AI Services**: [Groq SDK](https://groq.com/), [OpenAI SDK](https://platform.openai.com/), OpenRouter API
- **PWA**: `@ducanh2912/next-pwa`
- **Icons**: [Lucide React](https://lucide.dev/)

---

## Environment Variables

Copy `.env.example` to `.env.local` and configure your API keys:

```bash
# Groq API configuration for Whisper & Llama
GROQ_API_KEY=your-groq-api-key-here

# Hack Club AI / OpenAI compatible proxy configuration
HACK_CLUB_API_KEY=your-hack-club-api-key-here
HACK_CLUB_CDN_API_KEY=your-hack-club-cdn-api-key-here

# OpenRouter Free / Fallback API configuration (Optional)
OPENROUTER_API_KEY=your-openrouter-api-key-here

# Supabase project configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key-here
```

---

## Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/FabioCanavarro/YapSite.git
   cd YapSite
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Build for production**:
   ```bash
   npm run build
   npm run start
   ```

---

## Cron Jobs & Automation

YapSite includes a scheduled Vercel Cron Job configured in `vercel.json`:
- **Path**: `/api/cron/retry-pending`
- **Schedule**: `0 0 * * *` (Daily at Midnight UTC)
- **Function**: Automatically fetches pending/failed journal entries and attempts re-analysis via multi-model AI fallbacks.

---

## License

Distributed under the MIT License. See `LICENSE` for details.
