/* =====================================================================
   CONNECTION SETTINGS — paste your Supabase details here (step 2 of the
   setup guide). Both values are safe to be public: Supabase's security
   rules decide what each logged-in user can see.
   Supabase dashboard → Project Settings → API
   ===================================================================== */
window.SETTINGS = {
  supabaseUrl: 'https://qoeofmlzblkajoawvtmu.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvZW9mbWx6YmxrYWpvYXd2dG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MTg0NjksImV4cCI6MjEwOTA5NDQ2OX0.tm8PbUP8D1u7IJBRd0BQvOLBU-VFjFuLQMqPn4gNv7E',
  /* Google sign-in on coffeeko.in itself (Google Cloud → Google Auth Platform → Clients → CoffeeKo web → Client ID).
     Public by design, like the key above. Empty = use the older Google sign-in that goes through Supabase. */
  googleClientId: '764126392179-9cs0mo20bvrppumts093622tqq1oipm6.apps.googleusercontent.com',
};
