-- Enable UUID generation extension
create extension if not exists "uuid-ossp";

-- Create journal_logs table
create table if not exists public.journal_logs (
    id uuid primary key default uuid_generate_v4(),
    user_id uuid references auth.users(id) on delete cascade,
    audio_url text not null,
    ai_title text,
    ai_mood_color text,
    raw_transcript text,
    tidied_log text,
    ai_tags text[] default '{}',
    custom_tags text[] default '{}',
    reflections text,
    processing_status text not null default 'completed',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for searching and filtering performance
create index if not exists journal_logs_user_id_idx on public.journal_logs(user_id);
create index if not exists journal_logs_created_at_idx on public.journal_logs(created_at desc);

-- Enable Row Level Security (RLS)
alter table public.journal_logs enable row level security;

-- Row Level Security (RLS) Policies
create policy "Users can view their own journal entries"
    on public.journal_logs for select
    using (auth.uid() = user_id);

create policy "Users can insert their own journal entries"
    on public.journal_logs for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own journal entries"
    on public.journal_logs for update
    using (auth.uid() = user_id);

create policy "Users can delete their own journal entries"
    on public.journal_logs for delete
    using (auth.uid() = user_id);

-- Create the audio_journals storage bucket (Public by default so URLs are readable)
-- Set the file_size_limit to 2GB (2147483648 bytes) to allow large files
insert into storage.buckets (id, name, public, file_size_limit)
values ('audio_journals', 'audio_journals', true, 2147483648)
on conflict (id) do update set file_size_limit = 2147483648;

-- Drop existing storage policies if they already exist to prevent execution errors
drop policy if exists "Allow authenticated insert" on storage.objects;
drop policy if exists "Allow authenticated select" on storage.objects;
drop policy if exists "Allow authenticated delete" on storage.objects;

-- Create storage policies specifically for the audio_journals bucket
create policy "Allow authenticated insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'audio_journals');

create policy "Allow authenticated select" on storage.objects
    for select to authenticated
    using (bucket_id = 'audio_journals');

create policy "Allow authenticated delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'audio_journals');

