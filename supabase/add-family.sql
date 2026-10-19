-- First create three confirmed users in Authentication > Users > Add user.
-- Use one account for each parent and one dedicated account for the shared iPad.
-- Replace the three example emails below with those users' actual emails.
-- Run this only in the dashboard SQL editor, after schema.sql.
do $$
declare
 family uuid := gen_random_uuid();
 parent_one uuid;
 parent_two uuid;
 shared_ipad uuid;
begin
 select id into parent_one from auth.users where lower(email)=lower('YOUR_EMAIL_HERE');
 select id into parent_two from auth.users where lower(email)=lower('KELS_EMAIL_HERE');
 select id into shared_ipad from auth.users where lower(email)=lower('IPAD_ACCOUNT_EMAIL_HERE');
 if parent_one is null or parent_two is null or shared_ipad is null then
  raise exception 'Create all three users first and replace the example emails.';
 end if;
 if parent_one=parent_two or parent_one=shared_ipad or parent_two=shared_ipad then
  raise exception 'Use three different accounts.';
 end if;
 -- Deliberately fail rather than overwrite an existing family membership.
 insert into public.connect_members(user_id,family_id,slots) values
 (parent_one,family,array[0]),(parent_two,family,array[1]),(shared_ipad,family,array[2,3,4]);
end $$;
