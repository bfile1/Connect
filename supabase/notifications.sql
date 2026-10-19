-- Add-on migration: run in the Supabase SQL Editor after schema.sql.
-- Safe to run again. Contains no credentials and does not send notifications itself.
begin;
create table if not exists public.connect_push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 family_id uuid not null,
 endpoint text not null unique,
 subscription jsonb not null,
 created_at timestamptz not null default now()
);
create table if not exists public.connect_push_events (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null,
 person integer not null check(person between 0 and 4),
 kind text not null check(kind in ('check-in','message','idea','vote')),
 action text not null check(action in ('added','updated','removed')),
 created_at timestamptz not null default now(),
 delivered_at timestamptz,
 locked_until timestamptz
);
create index if not exists connect_push_events_pending on public.connect_push_events(created_at) where delivered_at is null;
create table if not exists public.connect_push_deliveries (
 event_id uuid not null references public.connect_push_events(id) on delete cascade,
 subscription_id uuid not null references public.connect_push_subscriptions(id) on delete cascade,
 sent_at timestamptz not null default now(),
 primary key(event_id, subscription_id)
);
-- Access only through the Edge Function, which validates each signed-in parent.
alter table public.connect_push_subscriptions enable row level security;
alter table public.connect_push_events enable row level security;
alter table public.connect_push_deliveries enable row level security;
revoke all on public.connect_push_subscriptions,public.connect_push_events,public.connect_push_deliveries from anon,authenticated;
grant all on public.connect_push_subscriptions,public.connect_push_events,public.connect_push_deliveries to service_role;
create or replace function public.connect_queue_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; kind_value text;
begin
 if TG_OP='UPDATE' and to_jsonb(NEW)=to_jsonb(OLD) then return NEW; end if;
 if TG_OP='DELETE' then row_data:=to_jsonb(OLD); else row_data:=to_jsonb(NEW); end if;
 kind_value:=case TG_TABLE_NAME when 'connect_checkins' then 'check-in' when 'connect_messages' then 'message' when 'connect_ideas' then 'idea' when 'connect_votes' then 'vote' end;
 insert into public.connect_push_events(family_id,person,kind,action)
 values((row_data->>'family_id')::uuid,(row_data->>'person')::integer,kind_value,
 case TG_OP when 'UPDATE' then 'updated' when 'DELETE' then 'removed' else 'added' end);
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function public.connect_queue_push() from public,anon,authenticated;
drop trigger if exists connect_push_checkins on public.connect_checkins;
create trigger connect_push_checkins after insert or update on public.connect_checkins for each row execute function public.connect_queue_push();
drop trigger if exists connect_push_messages on public.connect_messages;
create trigger connect_push_messages after insert on public.connect_messages for each row execute function public.connect_queue_push();
drop trigger if exists connect_push_ideas on public.connect_ideas;
create trigger connect_push_ideas after insert on public.connect_ideas for each row execute function public.connect_queue_push();
drop trigger if exists connect_push_votes on public.connect_votes;
create trigger connect_push_votes after insert or delete on public.connect_votes for each row execute function public.connect_queue_push();
-- Lease each event so overlapping webhook/cron requests do not normally send twice.
create or replace function public.connect_claim_push(event uuid) returns boolean
language sql security definer set search_path = '' as $$
 with claimed as (
 update public.connect_push_events set locked_until=now()+interval '2 minutes'
 where id=event and delivered_at is null and (locked_until is null or locked_until<now()) returning id
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.connect_claim_push(uuid) from public,anon,authenticated;
grant execute on function public.connect_claim_push(uuid) to service_role;
commit;
