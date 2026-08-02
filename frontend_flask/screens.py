"""Screen registry for the project-map index page.

Extracted verbatim from the original frontend/index.html cards so the
rendered markup is identical; only the href changes, from the generator's
{{DATA:SCREEN:n}} placeholder to a real Flask endpoint name.
"""

from __future__ import annotations

SECTIONS: list[dict] = [
    {
        "heading": 'Citizen Experience',
        "icon": 'group',
        "cards": [
            {
                "endpoint": 'public.services',
                "title": 'Landing Page',
                "blurb": 'The primary entry point for all citizens to access services.',
                "alt": 'A clean, minimalist government landing page layout showing a heroic search bar over a subtle tunisian landscape graphic. High key lighting, modern UI style with deep navy and red accents.',
                "img": 'img-9179d34af7be.jpg',
            },
            {
                "endpoint": 'public.login',
                "title": 'Login',
                "blurb": 'Secure authentication gateway for citizen profiles.',
                "alt": 'A secure login screen interface featuring a minimalist white card centered on a light gray background. It shows input fields and a prominent red primary action button. Professional, trustworthy aesthetic.',
                "img": 'img-bd78e8b3a7f3.jpg',
            },
            {
                "endpoint": 'citizen.dashboard',
                "title": 'Dashboard',
                "blurb": 'Personalized overview of citizen records and activities.',
                "alt": 'A user dashboard interface displaying structured data cards and a side navigation bar. Clean typography, white surfaces with subtle borders, highlighting recent activity and status.',
                "img": 'img-57e6aa78a6ec.jpg',
            },
            {
                "endpoint": 'citizen.submit_request',
                "title": 'Submit Request',
                "blurb": 'Multi-step form for initiating official government procedures.',
                "alt": 'A structured multi-step form interface for submitting official requests. Features clear progress indicators, large input fields, and high-contrast labels. Institutional and clean design.',
                "img": 'img-c7da550f73d8.jpg',
            },
            {
                "endpoint": 'citizen.requests_list',
                "title": 'My Requests',
                "blurb": 'Structured data table tracking the status of submitted items.',
                "alt": 'A clean data table interface displaying a list of user requests with status badges. Zebra-striped rows, deep navy headers, providing a clear overview of application states.',
                "img": 'img-0c5aeee57f6e.jpg',
            },
            {
                "endpoint": 'citizen.book_appointment',
                "title": 'Book Appointment',
                "blurb": 'Interactive scheduling tool for in-person government visits.',
                "alt": 'A calendar interface for booking appointments. Features a grid layout for dates, time slot selection buttons, and a clean, accessible layout utilizing navy and subtle gray tones.',
                "img": 'img-cdd9f0549147.jpg',
            },
            {
                "endpoint": 'citizen.notifications',
                "title": 'Notification Center',
                "blurb": 'Centralized hub for important alerts and messages.',
                "alt": 'A notification center UI showing a vertical list of alerts. Each alert features an icon, timestamp, and short message text on a clean white background with subtle dividers.',
                "img": 'img-f0573fb85c4a.jpg',
            },
            {
                "endpoint": 'citizen.payment_confirmation',
                "title": 'Payment Confirmation',
                "blurb": 'Transactional success screen with receipt details.',
                "alt": 'A transaction confirmation screen showing a large green checkmark icon, receipt details, and a primary action button to return to dashboard. Clean, reassuring, and professional.',
                "img": 'img-5d9aa780b56c.jpg',
            },
        ],
    },
    {
        "heading": 'Government Operations (Staff)',
        "icon": 'corporate_fare',
        "cards": [
            {
                "endpoint": 'staff.workbench',
                "title": 'Staff Workbench',
                "blurb": 'Primary operational dashboard for government employees.',
                "alt": 'A dense, data-rich staff workbench interface showing split panels for processing queues and detailed document views. Professional, high-utility aesthetic using muted institutional colors.',
                "img": 'img-c337bf0561a7.jpg',
            },
            {
                "endpoint": 'staff.review',
                "title": 'Verify Request',
                "blurb": 'Detailed view for staff to review and process applications.',
                "alt": 'An interface for verifying documents. Shows side-by-side comparison of user data and uploaded ID scans, with prominent approve/reject action buttons. Highly functional and structured layout.',
                "img": 'img-e804cbbd1940.jpg',
            },
        ],
    },
    {
        "heading": 'System Administration',
        "icon": 'admin_panel_settings',
        "cards": [
            {
                "endpoint": 'admin.index',
                "title": 'Admin Management',
                "blurb": 'Global configuration and user role oversight.',
                "alt": 'An admin control panel interface featuring system metrics, user role management tables, and configuration settings. High-density information design with a technical, authoritative look.',
                "img": 'img-a99969afbedc.jpg',
            },
        ],
    },
]
