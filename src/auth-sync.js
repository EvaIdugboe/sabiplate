import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qmjioypfwvhccdfcarhy.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_8EGzwhEgb1syMgbQNUksAQ_wZDL8PNR';
const APP_PREFIX = 'sabiplate-';
const SYNC_SCHEMA_VERSION = 1;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

const authState = {
  session: null,
  user: null,
  syncTimer: null,
  syncBusy: false,
  syncQueued: false,
  syncGeneration: 0,
  lastRemoteAt: null,
  lastValuesJson: null,
  modalView: 'signin',
  decoratedUserId: null
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

function appUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function recoveryUrl() {
  const url = new URL(appUrl());
  url.searchParams.set('recovery', '1');
  return url.toString();
}

function notify(message) {
  const toast = qs('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}

function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (message.includes('email not confirmed')) return 'Please confirm your email before signing in.';
  if (message.includes('user already registered')) return 'An account may already exist. Try signing in or resetting your password.';
  if (message.includes('password should be')) return 'Use a stronger password with at least 8 characters.';
  if (message.includes('rate limit') || message.includes('too many')) return 'Please wait a little before trying again.';
  if (message.includes('network') || message.includes('fetch')) return 'We could not reach cloud sync. Check your connection and try again.';
  return fallback;
}

function setAlert(message = '', kind = 'error') {
  const alert = qs('#authAlert');
  if (!alert) return;
  alert.textContent = message;
  alert.className = `auth-alert${message ? ' show' : ''}${kind === 'success' ? ' success' : ''}`;
}

function setBusy(form, busy, label = 'Please wait…') {
  const button = qs('[type="submit"]', form);
  if (!button) return;
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = label;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

function authMarkup() {
  return `
    <div class="auth-guest-actions" id="authGuestActions">
      <button class="auth-link-btn" id="authSignInTop" type="button">Sign in</button>
      <button class="auth-create-btn" id="authCreateTop" type="button">Create account</button>
    </div>
    <button class="auth-sync-pill hidden" id="authSyncPill" type="button" aria-label="Open account and sync settings">
      <span class="auth-sync-dot" aria-hidden="true"></span><span id="authSyncLabel">Cloud saved</span>
    </button>`;
}

function modalMarkup() {
  return `
  <div class="modal auth-modal" id="authModal" aria-hidden="true">
    <div class="modal-backdrop" data-auth-close></div>
    <section class="auth-modal-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
      <button class="auth-close" type="button" data-auth-close aria-label="Close account window">×</button>
      <div class="auth-brand-panel" aria-hidden="true">
        <div class="auth-brand-lockup"><span>S</span><b>SabiPlate</b></div>
        <p class="eyebrow">Your food, your goals</p>
        <h2>Take your plan with you.</h2>
        <p>Save favourites, meal plans, shopping progress and preferences securely across your devices.</p>
        <ul><li>Private to your account</li><li>Automatic cloud sync</li><li>Guest mode still works</li></ul>
      </div>
      <div class="auth-form-panel">
        <div id="authView"></div>
      </div>
    </section>
  </div>`;
}

function injectAuthUI() {
  const topActions = qs('.top-actions');
  const avatar = qs('#avatarBtn');
  if (topActions && avatar && !qs('#authGuestActions')) {
    const holder = document.createElement('div');
    holder.className = 'auth-header-slot';
    holder.innerHTML = authMarkup();
    topActions.insertBefore(holder, avatar);
  }
  if (!qs('#authModal')) {
    document.body.insertAdjacentHTML('beforeend', modalMarkup());
  }

  qs('#authSignInTop')?.addEventListener('click', () => openAuth('signin'));
  qs('#authCreateTop')?.addEventListener('click', () => openAuth('signup'));
  qs('#authSyncPill')?.addEventListener('click', () => openAuth('account'));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-auth-profile-action]')) openAuth(authState.user ? 'account' : 'signup');
  });
  qsa('[data-auth-close]').forEach((button) => button.addEventListener('click', closeAuth));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && qs('#authModal')?.classList.contains('open')) closeAuth();
  });
}

function openAuth(view = authState.user ? 'account' : 'signin') {
  const modal = qs('#authModal');
  if (!modal) return;
  renderAuthView(view);
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => qs('input, button', qs('#authView'))?.focus(), 20);
}

function closeAuth() {
  const modal = qs('#authModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  if (!qs('.modal.open') && !qs('.sheet.open')) document.body.style.overflow = '';
}

function renderAuthView(view, options = {}) {
  const root = qs('#authView');
  if (!root) return;
  authState.modalView = view;
  const email = authState.user?.email || '';

  if (view === 'signup') {
    root.innerHTML = `
      <span class="auth-kicker">Free account</span>
      <h1 id="authTitle">Create your SabiPlate account</h1>
      <p class="auth-intro">Start on this device, then pick up your plan anywhere.</p>
      <div class="auth-alert" id="authAlert" role="alert"></div>
      <form id="authSignupForm">
        <label class="auth-field">First name<input id="authSignupName" name="name" autocomplete="given-name" required maxlength="60"></label>
        <label class="auth-field">Email address<input id="authSignupEmail" name="email" type="email" inputmode="email" autocomplete="email" required></label>
        <label class="auth-field">Password<div class="auth-password-row"><input id="authSignupPassword" name="password" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-show-password="authSignupPassword">Show</button></div><small>At least 8 characters</small></label>
        <label class="auth-check"><input id="authSignupConsent" type="checkbox" required><span>I agree to save my SabiPlate profile and planning data securely to my account.</span></label>
        <button class="auth-primary" type="submit">Create account</button>
      </form>
      <p class="auth-switch">Already have an account? <button type="button" data-auth-view="signin">Sign in</button></p>`;
  } else if (view === 'forgot') {
    root.innerHTML = `
      <span class="auth-kicker">Password help</span>
      <h1 id="authTitle">Reset your password</h1>
      <p class="auth-intro">Enter your email and we’ll send you a secure reset link.</p>
      <div class="auth-alert" id="authAlert" role="alert"></div>
      <form id="authForgotForm">
        <label class="auth-field">Email address<input id="authForgotEmail" name="email" type="email" inputmode="email" autocomplete="email" required></label>
        <button class="auth-primary" type="submit">Send reset link</button>
      </form>
      <p class="auth-switch"><button type="button" data-auth-view="signin">Back to sign in</button></p>`;
  } else if (view === 'recovery') {
    root.innerHTML = `
      <span class="auth-kicker">Secure reset</span>
      <h1 id="authTitle">Choose a new password</h1>
      <p class="auth-intro">Your new password must contain at least 8 characters.</p>
      <div class="auth-alert" id="authAlert" role="alert"></div>
      <form id="authRecoveryForm">
        <label class="auth-field">New password<div class="auth-password-row"><input id="authRecoveryPassword" name="password" type="password" autocomplete="new-password" minlength="8" required><button type="button" data-show-password="authRecoveryPassword">Show</button></div></label>
        <label class="auth-field">Confirm password<input id="authRecoveryConfirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required></label>
        <button class="auth-primary" type="submit">Save new password</button>
      </form>`;
  } else if (view === 'check-email') {
    root.innerHTML = `
      <div class="auth-success-icon" aria-hidden="true">✓</div>
      <span class="auth-kicker">Nearly there</span>
      <h1 id="authTitle">Check your email</h1>
      <p class="auth-intro">We sent a confirmation link. Open it on this device to finish creating your account and turn on cloud sync.</p>
      <button class="auth-primary" type="button" data-auth-view="signin">Back to sign in</button>`;
  } else if (view === 'account' && authState.user) {
    root.innerHTML = `
      <span class="auth-kicker">Account & sync</span>
      <h1 id="authTitle">Your SabiPlate account</h1>
      <div class="auth-account-summary"><span class="auth-account-avatar" id="authAccountAvatar">M</span><span><b id="authAccountName">Member</b><small id="authAccountEmail"></small></span></div>
      <div class="auth-sync-card"><span class="auth-sync-dot" aria-hidden="true"></span><span><b id="authAccountSync">Cloud sync is on</b><small>Your plans and preferences save automatically.</small></span><button type="button" id="authSyncNow">Sync now</button></div>
      <div class="auth-alert" id="authAlert" role="alert"></div>
      <details class="auth-account-details"><summary>Change email address</summary><form id="authEmailForm"><label class="auth-field">New email<input id="authNewEmail" type="email" inputmode="email" autocomplete="email" required></label><button class="auth-secondary" type="submit">Update email</button></form></details>
      <details class="auth-account-details"><summary>Change password</summary><form id="authPasswordForm"><label class="auth-field">New password<input id="authNewPassword" type="password" autocomplete="new-password" minlength="8" required></label><button class="auth-secondary" type="submit">Update password</button></form></details>
      <button class="auth-signout" type="button" id="authSignOut">Sign out</button>`;
    const profile = readJsonValue('sabiplate-profile-v9', {});
    const name = profile.name || authState.user.user_metadata?.first_name || 'Member';
    qs('#authAccountName').textContent = name;
    qs('#authAccountEmail').textContent = email;
    qs('#authAccountAvatar').textContent = name.charAt(0).toUpperCase();
  } else {
    root.innerHTML = `
      <span class="auth-kicker">Welcome back</span>
      <h1 id="authTitle">Sign in to SabiPlate</h1>
      <p class="auth-intro">Your saved plan will appear as soon as you sign in.</p>
      <div class="auth-alert" id="authAlert" role="alert"></div>
      <form id="authSigninForm">
        <label class="auth-field">Email address<input id="authSigninEmail" name="email" type="email" inputmode="email" autocomplete="email" required></label>
        <label class="auth-field">Password<div class="auth-password-row"><input id="authSigninPassword" name="password" type="password" autocomplete="current-password" required><button type="button" data-show-password="authSigninPassword">Show</button></div></label>
        <div class="auth-form-meta"><label class="auth-check compact"><input type="checkbox" checked><span>Keep me signed in</span></label><button type="button" data-auth-view="forgot">Forgot password?</button></div>
        <button class="auth-primary" type="submit">Sign in</button>
      </form>
      <p class="auth-switch">New to SabiPlate? <button type="button" data-auth-view="signup">Create an account</button></p>`;
  }

  bindAuthView();
  if (options.message) setAlert(options.message, options.kind || 'success');
}

function bindAuthView() {
  qsa('[data-auth-view]', qs('#authView')).forEach((button) => {
    button.addEventListener('click', () => renderAuthView(button.dataset.authView));
  });
  qsa('[data-show-password]', qs('#authView')).forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.showPassword);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
      button.textContent = input.type === 'password' ? 'Show' : 'Hide';
    });
  });
  qs('#authSignupForm')?.addEventListener('submit', handleSignup);
  qs('#authSigninForm')?.addEventListener('submit', handleSignin);
  qs('#authForgotForm')?.addEventListener('submit', handleForgotPassword);
  qs('#authRecoveryForm')?.addEventListener('submit', handleRecovery);
  qs('#authEmailForm')?.addEventListener('submit', handleEmailUpdate);
  qs('#authPasswordForm')?.addEventListener('submit', handlePasswordUpdate);
  qs('#authSignOut')?.addEventListener('click', handleSignout);
  qs('#authSyncNow')?.addEventListener('click', async () => {
    setSyncStatus('syncing');
    const ok = await pushNow();
    setAlert(ok ? 'Everything is saved to the cloud.' : 'Cloud sync could not finish. Your data is still safe on this device.', ok ? 'success' : 'error');
  });
}

async function handleSignup(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const firstName = qs('#authSignupName').value.trim();
  const email = qs('#authSignupEmail').value.trim().toLowerCase();
  const password = qs('#authSignupPassword').value;
  if (password.length < 8) return setAlert('Use at least 8 characters for your password.');
  setBusy(form, true, 'Creating account…');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { first_name: firstName },
      emailRedirectTo: appUrl()
    }
  });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not create the account. Please check your details and try again.'));
  updateLocalFirstName(firstName);
  if (data.session) {
    closeAuth();
    notify('Account created — cloud sync is on');
  } else {
    renderAuthView('check-email');
  }
}

async function handleSignin(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const email = qs('#authSigninEmail').value.trim().toLowerCase();
  const password = qs('#authSigninPassword').value;
  setBusy(form, true, 'Signing in…');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not sign you in. Please try again.'));
  closeAuth();
  notify('Signed in — checking your cloud data');
}

async function handleForgotPassword(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const email = qs('#authForgotEmail').value.trim().toLowerCase();
  setBusy(form, true, 'Sending link…');
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: recoveryUrl() });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not send the reset link. Please try again.'));
  setAlert('If an account exists for that email, a reset link is on its way.', 'success');
}

async function handleRecovery(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const password = qs('#authRecoveryPassword').value;
  const confirm = qs('#authRecoveryConfirm').value;
  if (password.length < 8) return setAlert('Use at least 8 characters for your password.');
  if (password !== confirm) return setAlert('Those passwords do not match.');
  setBusy(form, true, 'Saving password…');
  const { error } = await supabase.auth.updateUser({ password });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not update the password. Please request a new reset link.'));
  renderAuthView('account', { message: 'Your password has been updated.', kind: 'success' });
  window.history.replaceState({}, document.title, appUrl());
}

async function handleEmailUpdate(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const email = qs('#authNewEmail').value.trim().toLowerCase();
  setBusy(form, true, 'Updating…');
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: appUrl() });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not update the email address.'));
  setAlert('Check your inbox to confirm the new email address.', 'success');
}

async function handlePasswordUpdate(event) {
  event.preventDefault();
  setAlert();
  const form = event.currentTarget;
  const password = qs('#authNewPassword').value;
  if (password.length < 8) return setAlert('Use at least 8 characters for your password.');
  setBusy(form, true, 'Updating…');
  const { error } = await supabase.auth.updateUser({ password });
  setBusy(form, false);
  if (error) return setAlert(friendlyError(error, 'We could not update your password.'));
  form.reset();
  setAlert('Your password has been updated.', 'success');
}

async function handleSignout() {
  setAlert();
  await pushNow();
  const { error } = await supabase.auth.signOut();
  if (error) return setAlert(friendlyError(error, 'We could not sign you out.'));
  closeAuth();
  notify('Signed out — guest mode is still available');
}

function readJsonValue(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function updateLocalFirstName(firstName) {
  if (!firstName) return;
  const profile = readJsonValue('sabiplate-profile-v9', {});
  profile.name = firstName;
  window.localStorage.setItem('sabiplate-profile-v9', JSON.stringify(profile));
  if (window.SABI_DEBUG?.state?.profile) window.SABI_DEBUG.state.profile.name = firstName;
  qs('#avatarBtn').textContent = firstName.charAt(0).toUpperCase();
  window.dispatchEvent(new CustomEvent('sabiplate:changed'));
}

function snapshotValues() {
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(APP_PREFIX)) keys.push(key);
  }
  keys.sort();
  return Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)]));
}

function valuesJson(values = snapshotValues()) {
  return JSON.stringify(values);
}

function cloudPayload() {
  return {
    version: SYNC_SCHEMA_VERSION,
    values: snapshotValues(),
    client_updated_at: new Date().toISOString()
  };
}

function applyCloudPayload(payload) {
  const values = payload?.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return false;
  const localKeys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.startsWith(APP_PREFIX)) localKeys.push(key);
  }
  localKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) window.localStorage.removeItem(key);
  });
  Object.entries(values).forEach(([key, value]) => {
    if (key.startsWith(APP_PREFIX) && typeof value === 'string') window.localStorage.setItem(key, value);
  });
  return true;
}

function goalValue(goal) {
  return {
    'Lose weight steadily': 'lose_weight',
    'Maintain weight': 'maintain',
    'Build muscle': 'lean_bulk',
    'Eat better': 'eat_better'
  }[goal] || 'eat_better';
}

async function mirrorQueryableData(userId) {
  const profile = readJsonValue('sabiplate-profile-v9', {});
  const firstName = profile.name && profile.name !== 'Member'
    ? profile.name
    : authState.user?.user_metadata?.first_name || 'Member';
  const dietary = profile.diet && profile.diet !== 'Everything' ? [profile.diet] : [];
  const profileRequest = supabase.from('profiles').upsert({
    id: userId,
    first_name: firstName,
    goal: goalValue(profile.goal),
    daily_kcal: Math.max(1000, Math.min(4000, Number(profile.target) || 1750)),
    preferred_cuisines: Array.isArray(profile.cuisines) ? profile.cuisines : [],
    dietary_preferences: dietary,
    meals_per_day: Number(profile.mealsPerDay) || 4,
    onboarding_complete: true
  }, { onConflict: 'id' });

  const favourites = readJsonValue('sabiplate-favourites-v9', []);
  const favouritesRequest = (async () => {
    const { error: deleteError } = await supabase.from('favourites').delete().eq('user_id', userId);
    if (deleteError) throw deleteError;
    if (!Array.isArray(favourites) || !favourites.length) return;
    const rows = [...new Set(favourites)].map((recipeId) => ({ user_id: userId, recipe_id: recipeId }));
    const { error: insertError } = await supabase.from('favourites').insert(rows);
    if (insertError) throw insertError;
  })();

  const [{ error: profileError }, favouritesResult] = await Promise.all([
    profileRequest,
    favouritesRequest.then(() => ({ error: null })).catch((error) => ({ error }))
  ]);
  if (profileError) throw profileError;
  if (favouritesResult.error) throw favouritesResult.error;
}

function setSyncStatus(status) {
  const pill = qs('#authSyncPill');
  const label = qs('#authSyncLabel');
  if (!pill || !label) return;
  pill.dataset.status = status;
  const labels = {
    saved: 'Cloud saved',
    syncing: 'Saving…',
    offline: 'Saved on device'
  };
  label.textContent = labels[status] || labels.saved;
  const accountLabel = qs('#authAccountSync');
  if (accountLabel) accountLabel.textContent = status === 'offline' ? 'Waiting to sync' : status === 'syncing' ? 'Saving to cloud…' : 'Cloud sync is on';
}

async function pushNow() {
  const user = authState.user;
  if (!user) return false;
  if (authState.syncBusy) {
    authState.syncQueued = true;
    return true;
  }
  const generation = authState.syncGeneration;
  const payload = cloudPayload();
  const nextValuesJson = valuesJson(payload.values);
  if (nextValuesJson === authState.lastValuesJson) {
    setSyncStatus('saved');
    return true;
  }
  authState.syncBusy = true;
  setSyncStatus('syncing');
  try {
    const [{ data, error }] = await Promise.all([
      supabase.from('user_app_state').upsert({
        user_id: user.id,
        state: payload,
        schema_version: SYNC_SCHEMA_VERSION
      }, { onConflict: 'user_id' }).select('updated_at').single(),
      mirrorQueryableData(user.id)
    ]);
    if (error) throw error;
    if (generation !== authState.syncGeneration) return false;
    authState.lastRemoteAt = data.updated_at;
    authState.lastValuesJson = nextValuesJson;
    window.sessionStorage.setItem('sabiplate-cloud-hydrated', `${user.id}:${data.updated_at}`);
    setSyncStatus('saved');
    return true;
  } catch (error) {
    console.warn('SabiPlate cloud sync paused:', error?.message || error);
    setSyncStatus('offline');
    return false;
  } finally {
    authState.syncBusy = false;
    if (authState.syncQueued && authState.user) {
      authState.syncQueued = false;
      window.setTimeout(pushNow, 100);
    }
  }
}

function schedulePush() {
  if (!authState.user) return;
  window.clearTimeout(authState.syncTimer);
  setSyncStatus('syncing');
  authState.syncTimer = window.setTimeout(pushNow, 900);
}

async function initialiseCloud(user) {
  const generation = ++authState.syncGeneration;
  setSyncStatus('syncing');
  try {
    const { data, error } = await supabase
      .from('user_app_state')
      .select('state, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (generation !== authState.syncGeneration || authState.user?.id !== user.id) return;

    if (!data) {
      authState.lastValuesJson = null;
      await pushNow();
      return;
    }

    authState.lastRemoteAt = data.updated_at;
    const remoteValuesJson = valuesJson(data.state?.values || {});
    const localValuesJson = valuesJson();
    const guard = window.sessionStorage.getItem('sabiplate-cloud-hydrated');
    if (remoteValuesJson !== localValuesJson && guard !== `${user.id}:${data.updated_at}`) {
      if (applyCloudPayload(data.state)) {
        window.sessionStorage.setItem('sabiplate-cloud-hydrated', `${user.id}:${data.updated_at}`);
        window.location.reload();
        return;
      }
    }
    authState.lastValuesJson = remoteValuesJson;
    setSyncStatus('saved');
    await mirrorQueryableData(user.id);
  } catch (error) {
    console.warn('SabiPlate cloud setup paused:', error?.message || error);
    setSyncStatus('offline');
  }
}

async function pullIfNewer() {
  const user = authState.user;
  if (!user || authState.syncBusy || document.visibilityState === 'hidden') return;
  try {
    const { data, error } = await supabase
      .from('user_app_state')
      .select('state, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data || data.updated_at === authState.lastRemoteAt) return;
    const remoteValuesJson = valuesJson(data.state?.values || {});
    if (remoteValuesJson !== valuesJson() && applyCloudPayload(data.state)) {
      window.sessionStorage.setItem('sabiplate-cloud-hydrated', `${user.id}:${data.updated_at}`);
      window.location.reload();
      return;
    }
    authState.lastRemoteAt = data.updated_at;
    authState.lastValuesJson = remoteValuesJson;
    setSyncStatus('saved');
  } catch {
    setSyncStatus('offline');
  }
}

function updateAccountChrome() {
  const signedIn = Boolean(authState.user);
  qs('#authGuestActions')?.classList.toggle('hidden', signedIn);
  qs('#authSyncPill')?.classList.toggle('hidden', !signedIn);
  const avatar = qs('#avatarBtn');
  const profile = readJsonValue('sabiplate-profile-v9', {});
  const name = String(profile?.name || authState.user?.user_metadata?.first_name || 'Member');
  if (avatar) {
    avatar.textContent = name.charAt(0).toUpperCase();
    avatar.title = signedIn ? `Signed in as ${authState.user.email}` : 'Open profile';
  }
  if (qs('#view-profile')?.classList.contains('active')) window.SABI_DEBUG?.renderProfile?.();
}

function decorateProfile() {
  const view = qs('#view-profile');
  if (!view) return;
  const note = qs('.account-note', view);
  if (note && note.dataset.authDecorated !== (authState.user?.id || 'guest')) {
    note.dataset.authDecorated = authState.user?.id || 'guest';
    note.textContent = authState.user
      ? 'Cloud sync is active. Your preferences, favourites, meal plans and shopping progress save automatically.'
      : 'This device is saving your progress locally. Create a free account to sync it securely across devices.';
  }
  if (qs('#authProfileCard', view)) return;
  const aside = qs('.profile-grid aside', view);
  if (!aside) return;
  const card = document.createElement('div');
  card.id = 'authProfileCard';
  card.className = 'auth-profile-card';
  if (authState.user) {
    const title = document.createElement('b');
    title.textContent = 'Account connected';
    const email = document.createElement('small');
    email.textContent = authState.user.email || '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'auth-secondary';
    button.textContent = 'Manage account & sync';
    button.addEventListener('click', () => openAuth('account'));
    card.append(title, email, button);
  } else {
    card.innerHTML = '<b>Use SabiPlate anywhere</b><small>Create an account to keep this plan when you change phones or computers.</small>';
    const create = document.createElement('button');
    create.type = 'button';
    create.className = 'auth-primary';
    create.textContent = 'Create free account';
    create.addEventListener('click', () => openAuth('signup'));
    const signin = document.createElement('button');
    signin.type = 'button';
    signin.className = 'auth-text-action';
    signin.textContent = 'I already have an account';
    signin.addEventListener('click', () => openAuth('signin'));
    card.append(create, signin);
  }
  aside.prepend(card);
}

async function handleSession(session, event = 'INITIAL_SESSION') {
  const previousUserId = authState.user?.id;
  authState.session = session;
  authState.user = session?.user || null;
  if (!authState.user) {
    authState.syncGeneration += 1;
    authState.lastRemoteAt = null;
    authState.lastValuesJson = null;
    setSyncStatus('saved');
    updateAccountChrome();
    return;
  }
  updateAccountChrome();
  if (event === 'PASSWORD_RECOVERY') {
    openAuth('recovery');
  }
  if (previousUserId !== authState.user.id || event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    await initialiseCloud(authState.user);
  }
}

function installResetProtection() {
  document.addEventListener('click', async (event) => {
    const reset = event.target.closest?.('#resetApp');
    if (!reset || !authState.user) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!window.confirm('Reset your SabiPlate data on this device and in the cloud?')) return;
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(APP_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
    authState.lastValuesJson = null;
    await pushNow();
    window.location.reload();
  }, true);
}

function boot() {
  window.__SABI_AUTH_STAGE = 'starting';
  document.documentElement.dataset.sabiAuthStage = 'starting';
  try {
    injectAuthUI();
    window.__SABI_AUTH_STAGE = 'ui-ready';
    document.documentElement.dataset.sabiAuthStage = 'ui-ready';
    window.SABI_CLOUD = {
      client: supabase,
      open: openAuth,
      pushNow,
      get user() { return authState.user; }
    };
    installResetProtection();
    updateAccountChrome();
    window.__SABI_AUTH_STAGE = 'chrome-ready';
    document.documentElement.dataset.sabiAuthStage = 'chrome-ready';

    document.documentElement.dataset.sabiAuthStage = 'profile-ready';

    window.addEventListener('sabiplate:changed', schedulePush);
    window.addEventListener('focus', pullIfNewer);
    document.addEventListener('visibilitychange', pullIfNewer);

    supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => handleSession(session, event), 0);
    });
    supabase.auth.getSession().then(({ data }) => handleSession(data.session, 'INITIAL_SESSION'));
    window.__SABI_AUTH_STAGE = 'ready';
    document.documentElement.dataset.sabiAuthStage = 'ready';
    window.dispatchEvent(new CustomEvent('sabiplate:auth-ready'));

    const url = new URL(window.location.href);
    if (url.searchParams.get('recovery') === '1') openAuth('recovery');
    if (url.searchParams.get('error_description')) {
      openAuth('signin');
      setAlert(decodeURIComponent(url.searchParams.get('error_description')));
    }
  } catch (error) {
    window.__SABI_AUTH_ERROR = String(error?.message || error);
    document.documentElement.dataset.sabiAuthError = String(error?.message || error);
    console.error('SabiPlate account services could not start:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
