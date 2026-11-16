-- RLS protects row-level CRUD. Remove table-level capabilities that would
-- either bypass RLS (TRUNCATE) or are unnecessary in the browser client.
revoke truncate, references, trigger
on table public.user_app_state,
  public.profiles,
  public.favourites,
  public.meal_plans,
  public.meal_plan_items,
  public.meal_plan_portions,
  public.households,
  public.household_members,
  public.shopping_lists,
  public.shopping_items,
  public.pantry_items
from authenticated;
