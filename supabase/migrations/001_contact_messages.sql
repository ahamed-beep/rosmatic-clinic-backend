create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  treatment text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;