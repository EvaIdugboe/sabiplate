-- Secure, per-user state storage for the existing SabiPlate browser app.
create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"version":1,"values":{}}'::jsonb,
  schema_version integer not null default 1 check (schema_version > 0),
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

drop policy if exists "Users can read their own app state" on public.user_app_state;
create policy "Users can read their own app state"
on public.user_app_state for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own app state" on public.user_app_state;
create policy "Users can insert their own app state"
on public.user_app_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app state" on public.user_app_state;
create policy "Users can update their own app state"
on public.user_app_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own app state" on public.user_app_state;
create policy "Users can delete their own app state"
on public.user_app_state for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists set_user_app_state_updated_at on public.user_app_state;
create trigger set_user_app_state_updated_at
before update on public.user_app_state
for each row execute function public.set_updated_at();

revoke all on table public.user_app_state from anon;
grant select, insert, update, delete on table public.user_app_state to authenticated;

-- Private app data must never be available to anonymous visitors, even if a
-- future policy is accidentally added. RLS remains the primary row boundary.
revoke all on table public.profiles from anon;
revoke all on table public.favourites from anon;
revoke all on table public.meal_plans from anon;
revoke all on table public.meal_plan_items from anon;
revoke all on table public.meal_plan_portions from anon;
revoke all on table public.households from anon;
revoke all on table public.household_members from anon;
revoke all on table public.shopping_lists from anon;
revoke all on table public.shopping_items from anon;
revoke all on table public.pantry_items from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.favourites to authenticated;
grant select, insert, update, delete on table public.meal_plans to authenticated;
grant select, insert, update, delete on table public.meal_plan_items to authenticated;
grant select, insert, update, delete on table public.meal_plan_portions to authenticated;
grant select, insert, update, delete on table public.households to authenticated;
grant select, insert, update, delete on table public.household_members to authenticated;
grant select, insert, update, delete on table public.shopping_lists to authenticated;
grant select, insert, update, delete on table public.shopping_items to authenticated;
grant select, insert, update, delete on table public.pantry_items to authenticated;

-- Recipe content is public read-only data.
revoke insert, update, delete, truncate, references, trigger
on table public.recipes, public.recipe_ingredients, public.recipe_image_assets
from anon, authenticated;
grant select on table public.recipes, public.recipe_ingredients, public.recipe_image_assets
to anon, authenticated;

-- Remove the temporary hosted-payload upload path from the public role.
drop policy if exists "temp hosted payload upload" on public.app_payload_chunks;
revoke insert, update, delete, truncate, references, trigger
on table public.app_payload_chunks from anon;
