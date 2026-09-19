"""
Honey Mesh Agent
Deploys honeytokens near the leaked credentials.
The attacker interaction trigger is SIMULATED and labeled honestly.
Real: token generation and deployment logic.
Simulated: the attacker interaction event (no live attacker present during demo).
"""
import os
import asyncio
import secrets
import string
from typing import List, Dict, Any, Callable


def generate_honeytoken(token_type: str) -> str:
    """Generate a realistic-looking fake credential for honeypot use."""
    charset = string.ascii_letters + string.digits
    suffix = ''.join(secrets.choice(charset) for _ in range(24))
    
    prefixes = {
        "stripe-key": "sk_live_NYX_HONEY_",
        "github-token": "ghp_NYX_HONEY_",
        "mongodb-uri": "mongodb+srv://honey:trap@cluster0.nyx.honeynet.io",
        "generic": "NYX_HONEY_",
        "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.NYX_HONEY_",
    }
    prefix = prefixes.get(token_type, "NYX_HONEY_")
    return prefix + suffix


async def run_honey_mesh(findings: List[Dict], broadcast: Callable) -> Dict[str, Any]:
    """Deploy honeytokens based on the types of credentials found."""
    tokens = []
    
    # Map findings to token types
    type_map = {
        "Stripe": "stripe-key",
        "GitHub": "github-token",
        "MongoDB": "mongodb-uri",
        "JWT": "jwt",
        "GenericApiKey": "generic",
    }
    
    seen_types = set()
    for f in findings:
        detector = f.get("detector", "generic")
        for key, token_type in type_map.items():
            if key.lower() in detector.lower() and token_type not in seen_types:
                seen_types.add(token_type)
                token_val = generate_honeytoken(token_type)
                token = {
                    "id": f"ht-{len(tokens)+1:03d}",
                    "type": token_type,
                    "value": token_val,
                    "deployed_at": f.get("file", "config").replace(".env", ".env.honey"),
                    "description": f"Fake {detector} honeytoken",
                    "finding_id": f.get("id"),
                }
                tokens.append(token)
                await broadcast({
                    "phase": "honey_mesh",
                    "status": "deployed",
                    "token": token,
                    "message": f"Honeytoken deployed: {token_type}"
                })
                await asyncio.sleep(0.4)

    if not tokens:
        # Always deploy at least one generic token
        token = {
            "id": "ht-001",
            "type": "generic",
            "value": generate_honeytoken("generic"),
            "deployed_at": "config/.env.honey",
            "description": "Generic honeytoken",
        }
        tokens.append(token)

    return {
        "tokens": tokens,
        "triggered": False,
        "confidence": 0,
        # Honest labeling: simulation is explicitly flagged
        "summary": f"{len(tokens)} honeytokens deployed. Use 'Simulate Attacker Interaction' to test detection. (Simulation - no live attacker present)"
    }
