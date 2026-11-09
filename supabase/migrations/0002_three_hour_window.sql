alter table public.daily_usage rename to usage_windows;
alter table public.usage_windows rename column day to window_start;
alter table public.usage_windows alter column window_start type timestamptz using window_start::timestamptz;

-- Windows are fixed 3-hour blocks (00:00, 03:00, ... UTC).
create or replace function public.take_review(p_user text, p_limit int) returns int
language plpgsql security definer set search_path = '' as $$
declare used int;
begin
  insert into public.profiles (user_id) values (p_user)
    on conflict (user_id) do update set last_seen_at = now();
  insert into public.usage_windows as u (user_id, window_start, reviews)
    values (p_user, to_timestamp(floor(extract(epoch from now()) / 10800) * 10800), 1)
    on conflict (user_id, window_start) do update set reviews = u.reviews + 1 where u.reviews < p_limit
    returning u.reviews into used;
  return coalesce(p_limit - used, -1);
end $$;

create or replace function public.return_review(p_user text) returns void
language sql security definer set search_path = '' as $$
  update public.usage_windows set reviews = greatest(reviews - 1, 0)
  where user_id = p_user and window_start = to_timestamp(floor(extract(epoch from now()) / 10800) * 10800);
$$;
