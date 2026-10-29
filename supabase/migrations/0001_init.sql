-- CodePilot schema. Run once in the Supabase SQL editor (or `supabase db push`).
-- Accounts live in Clerk; user_id is the Clerk user id (e.g. "user_2abc..."). Only the Worker reads or
-- writes these tables, with the secret key: RLS is on and there are no policies, so the public keys get nothing.

create table public.profiles (
  user_id text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (user_id) on delete cascade,
  filename text not null,
  language text not null,
  code text not null,
  findings jsonb not null,
  improved_code text,
  created_at timestamptz not null default now()
);
create index reviews_user_created on public.reviews (user_id, created_at desc);

create table public.daily_usage (
  user_id text not null references public.profiles (user_id) on delete cascade,
  day date not null,
  reviews int not null default 0,
  primary key (user_id, day)
);

alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.daily_usage enable row level security;

-- Counts one review against today's (UTC) limit in a single atomic step.
-- Returns how many reviews are left after this one, or -1 if the limit was already reached.
create function public.take_review(p_user text, p_limit int) returns int
language plpgsql security definer set search_path = '' as $$
declare used int;
begin
  insert into public.profiles (user_id) values (p_user)
    on conflict (user_id) do update set last_seen_at = now();
  insert into public.daily_usage as u (user_id, day, reviews) values (p_user, (now() at time zone 'utc')::date, 1)
    on conflict (user_id, day) do update set reviews = u.reviews + 1 where u.reviews < p_limit
    returning u.reviews into used;
  return coalesce(p_limit - used, -1);
end $$;

-- Gives a review back when the model failed, so errors don't eat into the limit.
create function public.return_review(p_user text) returns void
language sql security definer set search_path = '' as $$
  update public.daily_usage set reviews = greatest(reviews - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

revoke execute on function public.take_review(text, int), public.return_review(text) from public, anon, authenticated;
