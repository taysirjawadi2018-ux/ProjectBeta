"""Route blueprints, grouped by who is allowed to reach them.

    public   — no session needed (project map, sign-in, register, catalogue,
               legal/informational pages)
    citizen  — @login_required
    staff    — @staff_required
    admin    — @admin_required

The split is deliberate: the guard lives on the blueprint's routes rather than
being remembered per handler, so a new route inherits the right default.
"""
