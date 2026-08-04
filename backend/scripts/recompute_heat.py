"""Recompute area heat / towers. Run on a schedule (~every 15 min).

Local:   python scripts/recompute_heat.py
Cron:    point a scheduler at this, or curl POST /api/heat/recompute with the
         X-Cron-Key header set to HEAT_CRON_KEY.
"""
import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv
load_dotenv()

from db.heat import recompute_heat  # noqa: E402

if __name__ == "__main__":
    print(asyncio.run(recompute_heat()))
