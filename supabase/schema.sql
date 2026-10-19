-- Run once in the Supabase SQL Editor. No passwords or secret keys belong here.
begin;
create table if not exists public.connect_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 family_id uuid not null,
 slots integer[] not null check (cardinality(slots) > 0 and slots <@ array[0,1,2,3,4])
);
alter table public.connect_members enable row level security;
create policy "Read own membership" on public.connect_members for select to authenticated using (user_id = auth.uid());
-- Membership is managed only through the dashboard SQL editor, never the browser.
create table public.connect_checkins (
 family_id uuid not null, day date not null, person integer not null,
 mood integer not null check(mood between 0 and 4),
 wellbeing integer not null check(wellbeing between 1 and 5),
 happiness integer not null check(happiness between 1 and 5),
 energy integer not null check(energy between 1 and 5),
 note text not null default '' check(length(note)<=1000),
 primary key(family_id,day,person)
);
create table public.connect_messages (
 id uuid primary key default gen_random_uuid(), family_id uuid not null,
 person integer not null, recipient text not null check(recipient in ('all','0','1','2','3','4')),
 body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now()
);
create table public.connect_ideas (
 id uuid primary key default gen_random_uuid(), family_id uuid not null,
 person integer not null, category text not null check(category in ('🌳 Outings','🍝 Dinners','🍓 Snacks')),
 body text not null check(length(trim(body)) between 1 and 160),
 created_at timestamptz not null default now(), unique(id,family_id)
);
create table public.connect_votes (
 idea_id uuid not null, family_id uuid not null, person integer not null,
 primary key(idea_id,person), foreign key(idea_id,family_id) references public.connect_ideas(id,family_id) on delete cascade
);
alter table public.connect_checkins enable row level security;
alter table public.connect_messages enable row level security;
alter table public.connect_ideas enable row level security;
alter table public.connect_votes enable row level security;
-- All five family members can see family check-ins, notes, and ideas.
-- The shared iPad account can act only as one of the three boys.
create policy "Family read" on public.connect_checkins for select to authenticated using (family_id in (select family_id from public.connect_members where user_id=auth.uid()));
create policy "Own checkin insert" on public.connect_checkins for insert to authenticated with check(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_checkins.family_id and connect_checkins.person=any(m.slots)));
create policy "Own checkin update" on public.connect_checkins for update to authenticated using(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_checkins.family_id and connect_checkins.person=any(m.slots))) with check(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_checkins.family_id and connect_checkins.person=any(m.slots)));
create policy "Family read" on public.connect_messages for select to authenticated using (family_id in (select family_id from public.connect_members where user_id=auth.uid()));
create policy "Own message insert" on public.connect_messages for insert to authenticated with check(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_messages.family_id and connect_messages.person=any(m.slots)));
create policy "Family read" on public.connect_ideas for select to authenticated using (family_id in (select family_id from public.connect_members where user_id=auth.uid()));
create policy "Own idea insert" on public.connect_ideas for insert to authenticated with check(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_ideas.family_id and connect_ideas.person=any(m.slots)));
create policy "Family read" on public.connect_votes for select to authenticated using (family_id in (select family_id from public.connect_members where user_id=auth.uid()));
create policy "Own vote insert" on public.connect_votes for insert to authenticated with check(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_votes.family_id and connect_votes.person=any(m.slots)));
create policy "Own vote delete" on public.connect_votes for delete to authenticated using(exists(select 1 from public.connect_members m where m.user_id=auth.uid() and m.family_id=connect_votes.family_id and connect_votes.person=any(m.slots)));
grant select on public.connect_members to authenticated;
grant select,insert,update on public.connect_checkins to authenticated;
grant select,insert on public.connect_messages, public.connect_ideas to authenticated;
grant select,insert,delete on public.connect_votes to authenticated;
revoke all on public.connect_members,public.connect_checkins,public.connect_messages,public.connect_ideas,public.connect_votes from anon;
commit;
