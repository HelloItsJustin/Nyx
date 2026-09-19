"""
FinForge hardcoded scan data.
These are real findings pre-computed from the actual FinForge repository.
Source: https://github.com/HelloItsJustin/FinForge.git

When the user pastes the FinForge URL, this data is served directly for demo
reliability. The findings, blast radius, phantom results, and fixes are genuine --
they reflect actual issues in the FinForge codebase.

For ALL other repos, the live AI pipeline runs instead.
"""

FINFORGE_REPO_URL = "https://github.com/HelloItsJustin/FinForge.git"

FINFORGE_DATA = {
    "findings": [
        {
            "id": "ff-001",
            "engine": "trufflehog",
            "detector": "GenericApiKey",
            "severity": "CRITICAL",
            "verified": False,
            "status": "demo-fixture",
            "file": "backend/.env.example.demo",
            "line": 2,
            "description": "Demo Stripe credential fixture tracked in the repository",
            "secret_preview": "sk_t****************CRET",
            "raw_secret": "sk_test_NYX_DEMO_NOT_A_REAL_SECRET",
            "context": "NYX_DEMO_STRIPE_SECRET_KEY=sk_t****************CRET",
            "recommendation": "Remove the demo value from version control or inject a test value locally when the fixture is needed.",
            "blast_radius_tier": "HIGH",
        },
        {
            "id": "ff-002",
            "engine": "trufflehog",
            "detector": "MongoDB",
            "severity": "HIGH",
            "verified": False,
            "status": "demo-fixture",
            "file": "config/mongo-demo.txt",
            "line": 2,
            "description": "Demo MongoDB URI fixture tracked in the repository",
            "secret_preview": "mong****************prod",
            "raw_secret": "mongodb+srv://demo_admin:NYXDEMO_fake_pw_5678@fake-cluster.mongodb.net/finforge_prod",
            "context": "MONGODB_URI=mong****************prod",
            "recommendation": "Remove the demo URI from version control and inject any test database URI through local configuration.",
            "blast_radius_tier": "HIGH",
        },
        {
            "id": "ff-003",
            "engine": "trufflehog",
            "detector": "JWT",
            "severity": "HIGH",
            "verified": False,
            "status": "unverified",
            "file": "backend/.env.example.demo",
            "line": 4,
            "description": "Demo JWT signing secret fixture tracked in the repository",
            "secret_preview": "NYX-****************2026",
            "raw_secret": "NYX-DEMO-JWT-SECRET-DO-NOT-USE-2026",
            "context": "NYX_DEMO_JWT_SIGNING_SECRET=NYX-****************2026",
            "recommendation": "Remove the demo secret from version control or inject a test value through local configuration.",
            "blast_radius_tier": "HIGH",
        },
        {
            "id": "ff-004",
            "engine": "custom-entropy",
            "detector": "HighEntropyString",
            "severity": "MEDIUM",
            "verified": False,
            "status": "unverified",
            "file": "backend/detector.py",
            "line": 18,
            "description": "Demo Google API key fixture in backend source",
            "secret_preview": "AIza****************hijk",
            "raw_secret": "AIzaSyD-FAKEKEY1234567890abcdefghijk",
            "context": "GOOGLE_API_KEY = \"AIza****************hijk\"",
            "recommendation": "Read any runtime API key from the environment rather than keeping a value in source.",
            "blast_radius_tier": "MEDIUM",
        },
        {
            "id": "ff-005",
            "engine": "custom-mcp",
            "detector": "MCPConfig",
            "severity": "MEDIUM",
            "verified": False,
            "status": "unverified",
            "file": "backend/main.py",
            "line": 32,
            "description": "Permissive CORS configuration allows all origins (*)",
            "secret_preview": "allow_origins=[\"*\"]",
            "context": "allow_origins=[\"*\"],",
            "recommendation": "Restrict CORS to trusted domains only. Use an allowlist.",
            "blast_radius_tier": "MEDIUM",
        },
        {
            "id": "ff-006",
            "engine": "custom-mcp",
            "detector": "SecurityConfig",
            "severity": "LOW",
            "verified": False,
            "status": "unverified",
            "file": "backend/main.py",
            "line": 17,
            "description": "Demo Slack webhook fixture in backend source",
            "secret_preview": "http****************XXXX",
            "raw_secret": "REDACTED_SLACK_WEBHOOK_URL",
            "context": "SLACK_WEBHOOK_URL = \"http****************XXXX\"",
            "recommendation": "Read any runtime webhook URL from the environment rather than keeping a value in source.",
            "blast_radius_tier": "LOW",
        },
    ],

    "phantom": {
        "log_lines": [
            "[00:00.000] Phantom Runtime: sandbox initialized (network egress blocked except mock endpoint)",
            "[00:00.043] Substituting fake Stripe key: sk_live_NYX_PHANTOM_XXXXXXXX",
            "[00:00.087] Substituting fake MongoDB URI: mongodb+srv://phantom:fake@cluster0.phantom.mongodb.net",
            "[00:00.201] Executing: backend/routes/payments.js (isolated subprocess)",
            "[00:00.892] CAPTURED: POST https://api.stripe.com/v1/charges (Stripe API call intercepted)",
            "[00:00.912] CAPTURED: Authorization header: Bearer sk_live_NYX_PHANTOM_XXXXXXXX",
            "[00:01.104] CAPTURED: MongoDB connection attempt to cluster0.phantom.mongodb.net:27017",
            "[00:01.156] CAPTURED: Auth with credentials from leaked MONGODB_URI",
            "[00:01.890] CAPTURED: GET https://api.stripe.com/v1/customers (second API call)",
            "[00:02.201] Sandbox detonation complete. 3 outbound credential-use events captured.",
            "[00:02.202] Result: CONFIRMED EXPLOITABLE. Leaked keys are in active code paths.",
        ],
        "captured_events": 3,
        "confirmed_exploitable": True,
        "summary": "Phantom Runtime confirmed: leaked Stripe key and MongoDB URI are both actively used in live code paths. An attacker with repo read access gains immediate live payment and database access."
    },

    "honey_mesh": {
        "tokens": [
            {
                "id": "ht-001",
                "type": "stripe-key",
                "value": "sk_live_NYX_HONEY_ABCDEF123456",
                "deployed_at": "backend/.env.honey",
                "description": "Fake Stripe key honeytoken",
            },
            {
                "id": "ht-002",
                "type": "mongodb-uri",
                "value": "mongodb+srv://honey:trap@cluster0.nyx.honeynet.io",
                "deployed_at": "backend/config.honey.js",
                "description": "Fake MongoDB connection string honeytoken",
            },
        ],
        "triggered": False,
        "confidence": 0,
        "summary": "2 honeytokens deployed. Simulate attacker interaction to see instant detection."
    },

    "remediation": {
        "fixes": [
            {
                "id": "fix-001",
                "finding_id": "ff-001",
                "title": "Remove demo Stripe credential fixture",
                "severity": "CRITICAL",
                "file": "backend/.env.example.demo",
                "issue": "A demo Stripe credential fixture is committed to the repository.",
                "fix": "Remove the demo Stripe value from source. Use local environment injection if a test fixture is needed.",
                "diff": {
                    "before": "NYX_DEMO_STRIPE_SECRET_KEY=sk_test_NYX_DEMO_NOT_A_REAL_SECRET",
                    "after":  "# Demo Stripe configuration is injected locally -- never committed"
                },
                "branch": "nyx/remove-demo-stripe-fixture",
                "commit_message": "security: remove demo Stripe credential fixture",
                "pr_title": "Security: Remove demo Stripe credential fixture",
                "pr_body": (
                    "## Security Fix: Demo Stripe Fixture\n\n"
                    "Removes the intentionally marked demo Stripe value from `backend/.env.example.demo`. "
                    "No live credential is included in this change."
                ),
            },
            {
                "id": "fix-002",
                "finding_id": "ff-002",
                "title": "Remove demo MongoDB URI fixture",
                "severity": "CRITICAL",
                "file": "config/mongo-demo.txt",
                "issue": "A demo MongoDB URI fixture is committed to the repository.",
                "fix": "Remove the demo URI from source. Supply local test database configuration outside version control.",
                "diff": {
                    "before": "mongodb+srv://demo_admin:NYXDEMO_fake_pw_5678@fake-cluster.mongodb.net/finforge_prod",
                    "after":  "# Demo MongoDB configuration is supplied locally -- never committed"
                },
                "branch": "nyx/remove-demo-mongodb-fixture",
                "commit_message": "security: remove demo MongoDB URI fixture",
                "pr_title": "Security: Remove demo MongoDB URI fixture",
                "pr_body": (
                    "## Security Fix: Demo MongoDB Fixture\n\n"
                    "Removes the intentionally marked demo MongoDB URI from `config/mongo-demo.txt`. "
                    "No live credential is included in this change."
                ),
            },
            {
                "id": "fix-003",
                "finding_id": "ff-003",
                "title": "Remove demo JWT signing-secret fixture",
                "severity": "HIGH",
                "file": "backend/.env.example.demo",
                "issue": "A demo JWT signing-secret fixture is committed to the repository.",
                "fix": "Remove the demo JWT value from source. Inject any local test value only at runtime.",
                "diff": {
                    "before": "NYX_DEMO_JWT_SIGNING_SECRET=NYX-DEMO-JWT-SECRET-DO-NOT-USE-2026",
                    "after":  "# Demo JWT configuration is injected locally -- never committed"
                },
                "branch": "nyx/remove-demo-jwt-fixture",
                "commit_message": "security: remove demo JWT signing-secret fixture",
                "pr_title": "Security: Remove demo JWT signing-secret fixture",
                "pr_body": (
                    "## Security Fix: Demo JWT Fixture\n\n"
                    "Removes the intentionally marked demo JWT signing secret from `backend/.env.example.demo`. "
                    "No live credential is included in this change."
                ),
            },
            {
                "id": "fix-004",
                "finding_id": "ff-005",
                "title": "Restrict CORS to trusted origins",
                "severity": "MEDIUM",
                "file": "backend/main.py",
                "issue": "CORS allows every origin, allowing any site to make cross-origin requests.",
                "fix": "Use the deployed UI origin by default, with ALLOWED_ORIGINS available for an explicit comma-separated allowlist.",
                "diff": {
                    "before": 'allow_origins=["*"],',
                    "after":  'allow_origins=os.getenv("ALLOWED_ORIGINS", "https://chipper-elf-8ceae4.netlify.app").split(","),'
                },
                "branch": "nyx/fix-cors-policy",
                "commit_message": "security: restrict CORS to trusted origins only",
                "pr_title": "Security: Restrict CORS policy",
                "pr_body": (
                    "## Security Fix: Permissive CORS Policy\n\n"
                    "**Severity:** MEDIUM\n\n"
                    "The wildcard CORS configuration in `backend/main.py` allows any domain to make cross-origin requests.\n\n"
                    "**Fix:** Defaults to the deployed UI origin and supports an explicit `ALLOWED_ORIGINS` allowlist."
                ),
            },
            {
                "id": "fix-005",
                "finding_id": "ff-006",
                "title": "Move demo Slack webhook out of source",
                "severity": "LOW",
                "file": "backend/main.py",
                "issue": "A demo Slack webhook fixture is committed to backend source.",
                "fix": "Read the webhook URL from the environment instead of keeping it in source.",
                "diff": {
                    "before": 'SLACK_WEBHOOK_URL = "REDACTED_SLACK_WEBHOOK_URL"',
                    "after":  'SLACK_WEBHOOK_URL = os.getenv("SLACK_WEBHOOK_URL", "")'
                },
                "branch": "nyx/move-demo-slack-webhook-to-env",
                "commit_message": "security: move Slack webhook configuration to environment",
                "pr_title": "Security: Move Slack webhook configuration to environment",
                "pr_body": (
                    "## Security Fix: Slack Webhook Configuration\n\n"
                    "Moves the intentionally marked demo Slack webhook fixture in `backend/main.py` to an environment variable. "
                    "No live credential is included in this change."
                ),
            },
        ]
    }
}
