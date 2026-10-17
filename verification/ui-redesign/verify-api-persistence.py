"""Read-only live evidence; run on stdin in the existing backend container.

Only GET requests are issued. Database reads use a read-only transaction. Short
lived credentials stay in memory; only explicitly selected evidence is printed.
"""

import asyncio
import json
import logging
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import text

from app.api.auth import create_access_token
from app.database import async_session_maker, engine

UI_EMAIL = "ui-redesign-20261017-171957-e4b8a8@example.com"
DEMO_EMAIL = "demo@wardrowbe.local"
BLUE_ID = "3e7990fa-a938-45de-9654-8bc43d07dc36"
PANTS_ID = "d0e56d4f-4160-47c1-9eca-4397b51a496b"
SHOES_ID = "6c13b6b1-66d9-4b7b-b537-2e2ad58adc96"
BASE_URL = "http://frontend:3000/api/v1"


def serializable(value):
    if isinstance(value, (UUID, date, datetime)):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(type(value).__name__)


def selected(record, fields):
    return {field: record.get(field) for field in fields.split()}


async def verify():
    logging.disable(logging.CRITICAL)
    report = {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Independent read-only API and PostgreSQL persistence verification",
        "api_base": "http://localhost:3000/api/v1 (container route: frontend:3000)",
        "safety": {
            "http_methods": ["GET"],
            "database_transaction": "READ ONLY",
            "credentials": "Short-lived identity tokens kept in process memory only",
            "excluded": ["tokens", "configuration", "signed image URLs", "invite codes", "raw model output"],
        },
        "checks": [],
    }

    def check(name, passed, evidence):
        report["checks"].append({"name": name, "passed": bool(passed), "evidence": evidence})

    async with async_session_maker() as db:
        await db.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"))

        async def rows(query, **params):
            return [dict(row) for row in (await db.execute(text(query), params)).mappings()]

        users = await rows(
            "SELECT id,email,display_name,locale,timezone,onboarding_completed,family_id "
            "FROM users WHERE email IN (:ui,:demo)", ui=UI_EMAIL, demo=DEMO_EMAIL
        )
        by_email = {user["email"]: user for user in users}
        check("both_accounts_exist", set(by_email) == {UI_EMAIL, DEMO_EMAIL}, users)
        if set(by_email) != {UI_EMAIL, DEMO_EMAIL}:
            report["passed"] = False
            await db.rollback()
            return report
        ui, demo = by_email[UI_EMAIL], by_email[DEMO_EMAIL]
        uid, did = ui["id"], demo["id"]
        today = datetime.now(ZoneInfo(ui["timezone"])).date().isoformat()
        credentials = {}
        for user in (ui, demo):
            identities = await rows(
                "SELECT id FROM user_identities WHERE user_id=:uid "
                "ORDER BY CASE WHEN provider='dev' THEN 0 ELSE 1 END,created_at LIMIT 1",
                uid=user["id"],
            )
            if not identities:
                raise RuntimeError("MissingVerificationIdentity")
            credentials[user["email"]] = create_access_token(
                user["id"], identities[0]["id"], timedelta(minutes=5)
            )

        items = await rows(
            "SELECT id,user_id,name,type,primary_color,favorite,status,ai_processed,ai_confidence,"
            "tagging_status,tagged_by,wear_count,wears_since_wash,last_worn_at,last_washed_at,created_at "
            "FROM clothing_items WHERE user_id IN (:ui,:demo) ORDER BY created_at", ui=uid, demo=did
        )
        ui_items = [item for item in items if item["user_id"] == uid]
        demo_items = [item for item in items if item["user_id"] == did]
        item_by_id = {str(item["id"]): item for item in ui_items}
        ui_ids, demo_ids = set(item_by_id), {str(item["id"]) for item in demo_items}
        report["accounts"] = {"ui": ui, "demo": selected(demo, "id email onboarding_completed")}
        report["database"] = {"ui_items": ui_items, "demo_item_ids": sorted(demo_ids)}
        check("onboarding_and_profile_persisted", ui["onboarding_completed"] is True
              and ui["locale"] == "zh-CN" and ui["timezone"] == "Asia/Shanghai", ui)
        check("four_ui_items_five_demo_items_disjoint", len(ui_items) == 4
              and len(demo_items) == 5 and not (ui_ids & demo_ids),
              {"ui_count": len(ui_items), "demo_count": len(demo_items), "overlap_ids": sorted(ui_ids & demo_ids)})
        check("seed_classification_persisted", all(
            key in item_by_id and (item_by_id[key]["type"], item_by_id[key]["primary_color"]) == expected
            for key, expected in ((BLUE_ID, ("shirt", "blue")), (PANTS_ID, ("pants", "black")), (SHOES_ID, ("shoes", "white"))))
            , {key: selected(item_by_id.get(key, {}), "id type primary_color") for key in (BLUE_ID, PANTS_ID, SHOES_ID)})
        pants = item_by_id.get(PANTS_ID, {})
        wear = await rows("SELECT id,item_id,outfit_id,worn_at FROM item_history WHERE item_id=:id ORDER BY created_at", id=PANTS_ID)
        wash = await rows("SELECT id,item_id,washed_at FROM wash_history WHERE item_id=:id ORDER BY created_at", id=PANTS_ID)
        check("pants_edit_favorite_wear_wash_persisted", pants.get("name") == "黑色长裤（UI 已编辑）"
              and pants.get("favorite") is True and pants.get("wear_count", 0) >= 1
              and str(pants.get("last_worn_at")) == today and str(pants.get("last_washed_at")) == today
              and len(wear) == pants.get("wear_count") and len(wash) == 1,
              {"item": pants, "wear_history": wear, "wash_history": wash})
        coats = [item for item in ui_items if item["name"] == "UI 验收：红色外套"]
        check("red_coat_real_ai_tagging_persisted", len(coats) == 1
              and coats[0]["type"] == "coat" and coats[0]["primary_color"] == "red"
              and coats[0]["ai_processed"] is True and coats[0]["status"] == "ready"
              and float(coats[0]["ai_confidence"] or 0) == .9, coats)
        tagging = await rows(
            "SELECT t.job_id,t.item_id,t.attempts,t.published_at,t.completed_at "
            "FROM tagging_outbox t JOIN clothing_items i ON i.id=t.item_id WHERE i.user_id=:uid", uid=uid
        )
        report["database"]["tagging_intents"] = tagging
        check("tagging_intent_completed", len(tagging) == 1 and tagging[0]["completed_at"] is not None, tagging)

        outfits = await rows(
            "SELECT id,user_id,name,source,status,scheduled_for,source_item_id,cloned_from_outfit_id,created_at "
            "FROM outfits WHERE user_id=:uid ORDER BY created_at", uid=uid
        )
        links = await rows(
            "SELECT oi.outfit_id,oi.item_id,oi.position FROM outfit_items oi "
            "JOIN outfits o ON o.id=oi.outfit_id WHERE o.user_id=:uid ORDER BY oi.outfit_id,oi.position", uid=uid
        )
        for outfit in outfits:
            outfit["item_ids"] = [str(link["item_id"]) for link in links if link["outfit_id"] == outfit["id"]]
        manual = [o for o in outfits if o["source"] == "manual" and o["scheduled_for"] is None]
        worn = [o for o in outfits if o["cloned_from_outfit_id"] is not None]
        ai = [o for o in outfits if o["source"] == "on_demand"]
        pairings = [o for o in outfits if o["source"] == "pairing"]
        check("manual_three_item_lookbook_and_today_instance_persisted", len(manual) == len(worn) == 1
              and manual[0]["name"] == "UI 验收：周末蓝白穿搭"
              and set(manual[0]["item_ids"]) == {BLUE_ID, PANTS_ID, SHOES_ID}
              and worn[0]["cloned_from_outfit_id"] == manual[0]["id"]
              and str(worn[0]["scheduled_for"]) == today
              and worn[0]["item_ids"] == manual[0]["item_ids"], {"templates": manual, "wear_instances": worn})
        tasks = await rows(
            "SELECT id,kind,status,stage,attempts,generation,result->'outfit_ids' AS outfit_ids,created_at,updated_at "
            "FROM durable_tasks WHERE user_id=:uid ORDER BY created_at", uid=uid
        )
        task_events = await rows(
            "SELECT e.task_id,e.generation,e.attempts,e.published_at FROM task_outbox e "
            "JOIN durable_tasks t ON t.id=e.task_id WHERE t.user_id=:uid", uid=uid
        )
        check("single_ai_task_single_result_no_replay_duplicates", len(tasks) == len(ai) == 1
              and tasks[0]["status"] == "succeeded" and tasks[0]["attempts"] == 1
              and tasks[0]["outfit_ids"] == [str(ai[0]["id"])], {"tasks": tasks, "outbox": task_events, "outfits": ai})
        feedback = await rows(
            "SELECT f.outfit_id,f.accepted,f.rating,f.actually_worn,f.worn_at "
            "FROM user_feedback f JOIN outfits o ON o.id=f.outfit_id WHERE o.user_id=:uid", uid=uid
        )
        ai_feedback = [f for f in feedback if ai and f["outfit_id"] == ai[0]["id"]]
        check("ai_acceptance_four_star_actually_worn_persisted", len(ai_feedback) == 1
              and ai[0]["status"] == "accepted" and ai_feedback[0]["rating"] == 4
              and ai_feedback[0]["actually_worn"] is True and str(ai_feedback[0]["worn_at"]) == today,
              {"outfit_status": ai[0]["status"] if ai else None, "feedback": ai_feedback})
        check("single_blue_shirt_pairing_persisted", len(pairings) == 1
              and str(pairings[0]["source_item_id"]) == BLUE_ID and len(pairings[0]["item_ids"]) >= 2, pairings)
        signatures = Counter((o["source"], str(o["scheduled_for"]), str(o["source_item_id"]),
                              str(o["cloned_from_outfit_id"]), tuple(sorted(o["item_ids"]))) for o in outfits)
        duplicate_groups = sum(count > 1 for count in signatures.values())
        check("four_outfits_no_duplicate_members_or_semantic_rows", len(outfits) == 4
              and duplicate_groups == 0 and all(len(o["item_ids"]) == len(set(o["item_ids"]))
              and set(o["item_ids"]) <= ui_ids for o in outfits),
              {"count": len(outfits), "by_source": dict(Counter(o["source"] for o in outfits)),
               "duplicate_groups": duplicate_groups,
               "template_and_dated_wear_instance_are_distinct_records": True})
        preferences = await rows("SELECT color_favorites FROM user_preferences WHERE user_id=:uid", uid=uid)
        check("blue_white_preferences_persisted", len(preferences) == 1
              and set(preferences[0]["color_favorites"]) == {"blue", "white"}, preferences)
        families = await rows("SELECT id,name,created_by,created_at FROM families WHERE id=:id", id=ui["family_id"])
        members = await rows("SELECT id FROM users WHERE family_id=:id", id=ui["family_id"])
        invites = await rows("SELECT id FROM family_invites WHERE family_id=:id", id=ui["family_id"])
        check("family_created_no_invitation_sent", len(families) == 1 and families[0]["created_by"] == uid
              and families[0]["name"] == "UI 验收家庭" and len(members) == 1 and len(invites) == 0,
              {"family": families, "member_ids": [m["id"] for m in members], "invite_count": len(invites)})
        report["database"].update({"outfits": outfits, "feedback": feedback, "tasks": tasks})

        api_evidence = {}
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=30, follow_redirects=False) as client:
            async def get(email, path, params=None, expected=200):
                response = await client.get(path, params=params, headers={"Authorization": "Bearer " + credentials[email]})
                if response.status_code != expected:
                    check("api_status", False, {"account": "ui" if email == UI_EMAIL else "demo", "path": path,
                                                "status": response.status_code, "expected": expected})
                    return {} if expected == 200 else response.status_code
                return response.json() if expected == 200 else response.status_code

            profile = await get(UI_EMAIL, "/users/me")
            api_evidence["profile"] = selected(profile, "id email display_name locale timezone onboarding_completed family_id")
            check("api_profile_matches_database", all(str(profile.get(k)) == str(ui[k]) for k in
                  ("id", "email", "locale", "timezone", "onboarding_completed", "family_id")), api_evidence["profile"])
            api_items = await get(UI_EMAIL, "/items", {"page_size": 100})
            demo_api_items = await get(DEMO_EMAIL, "/items", {"page_size": 100})
            safe_fields = "id user_id name type primary_color favorite status ai_processed ai_confidence wear_count wears_since_wash last_worn_at last_washed_at"
            api_evidence["ui_items"] = [selected(i, safe_fields) for i in api_items.get("items", [])]
            api_evidence["demo_item_ids"] = [i["id"] for i in demo_api_items.get("items", [])]
            check("api_item_sets_match_both_database_owners", api_items.get("total") == 4
                  and demo_api_items.get("total") == 5
                  and {i["id"] for i in api_items.get("items", [])} == ui_ids
                  and {i["id"] for i in demo_api_items.get("items", [])} == demo_ids,
                  {"ui_total": api_items.get("total"), "demo_total": demo_api_items.get("total")})
            comparable = "name type primary_color favorite status ai_processed wear_count wears_since_wash last_worn_at last_washed_at".split()
            check("api_item_values_match_database", all(str(i.get(k)) == str(item_by_id[i["id"]].get(k))
                  for i in api_items.get("items", []) for k in comparable), api_evidence["ui_items"])
            history_api = await get(UI_EMAIL, f"/items/{PANTS_ID}/history", {"limit": 100})
            wash_api = await get(UI_EMAIL, f"/items/{PANTS_ID}/wash-history", {"limit": 100})
            check("api_wear_wash_history_match_database", isinstance(history_api, list) and isinstance(wash_api, list)
                  and {x["id"] for x in history_api} == {str(x["id"]) for x in wear}
                  and {x["id"] for x in wash_api} == {str(x["id"]) for x in wash},
                  {"wear_count": len(history_api), "wash_count": len(wash_api)})
            api_outfits = await get(UI_EMAIL, "/outfits", {"page_size": 100})
            expected_worn = {str(f["outfit_id"]) for f in feedback if f["worn_at"] is not None}
            worn_api = await get(UI_EMAIL, "/outfits", {"page_size": 100, "worn": "true", "is_lookbook": "false"})
            worn_ids = {o["id"] for o in worn_api.get("outfits", [])}
            check("worn_filter_includes_manual_and_ai_facts", len(expected_worn) == 2
                  and worn_ids == expected_worn and worn_api.get("total") == 2,
                  {"expected_ids": sorted(expected_worn), "returned_ids": sorted(worn_ids), "total": worn_api.get("total")})
            unworn_api = await get(UI_EMAIL, "/outfits", {"page_size": 100, "worn": "false"})
            unworn_ids = {o["id"] for o in unworn_api.get("outfits", [])}
            check("unworn_filter_excludes_all_actual_wear", unworn_ids == {str(o["id"]) for o in outfits} - expected_worn
                  and not (unworn_ids & expected_worn), {"returned_ids": sorted(unworn_ids), "total": unworn_api.get("total")})
            if manual:
                history_worn = await get(UI_EMAIL, "/outfits", {"page_size": 100, "worn": "true",
                    "is_lookbook": "false", "date_from": today, "date_to": today,
                    "cloned_from_outfit_id": str(manual[0]["id"])})
                history_ids = {o["id"] for o in history_worn.get("outfits", [])}
                check("worn_calendar_date_and_template_scope", history_ids == {str(o["id"]) for o in worn}
                      and history_worn.get("total") == 1, {"returned_ids": sorted(history_ids), "total": history_worn.get("total")})
            api_pairings = await get(UI_EMAIL, f"/pairings/item/{BLUE_ID}", {"page_size": 100})
            api_tasks = await get(UI_EMAIL, "/tasks", {"limit": 100})
            api_evidence["outfit_ids"] = [o["id"] for o in api_outfits.get("outfits", [])]
            api_evidence["pairing_ids"] = [o["id"] for o in api_pairings.get("pairings", [])]
            api_evidence["tasks"] = [selected(t, "id kind status stage attempts") for t in api_tasks.get("tasks", [])]
            check("api_outfits_pairings_tasks_match_database", api_outfits.get("total") == 4
                  and set(api_evidence["outfit_ids"]) == {str(o["id"]) for o in outfits}
                  and api_pairings.get("total") == 1 and set(api_evidence["pairing_ids"]) == {str(o["id"]) for o in pairings}
                  and {t["id"] for t in api_tasks.get("tasks", [])} == {str(t["id"]) for t in tasks}, api_evidence)
            if ai:
                api_feedback = await get(UI_EMAIL, f"/outfits/{ai[0]['id']}/feedback")
                safe_feedback = selected(api_feedback, "outfit_id accepted rating actually_worn worn_at")
                check("api_feedback_matches_persisted_rating", api_feedback.get("rating") == 4
                      and api_feedback.get("actually_worn") is True and api_feedback.get("worn_at") == today, safe_feedback)
            if preferences:
                api_pref = await get(UI_EMAIL, "/users/me/preferences")
                check("api_preferences_match_database", api_pref.get("color_favorites") == preferences[0]["color_favorites"],
                      {"color_favorites": api_pref.get("color_favorites")})
            api_family = await get(UI_EMAIL, "/families/me")
            check("api_family_matches_database_without_invites", api_family.get("id") == str(ui["family_id"])
                  and api_family.get("name") == "UI 验收家庭" and len(api_family.get("members", [])) == 1
                  and len(api_family.get("pending_invites", [])) == 0,
                  {"id": api_family.get("id"), "name": api_family.get("name"),
                   "member_count": len(api_family.get("members", [])), "pending_invite_count": len(api_family.get("pending_invites", []))})
            isolation = {
                "demo_get_ui_item": await get(DEMO_EMAIL, f"/items/{BLUE_ID}", expected=404),
                "ui_get_demo_item": await get(UI_EMAIL, f"/items/{next(iter(demo_ids))}", expected=404),
            }
            if ai:
                isolation["demo_get_ui_outfit"] = await get(DEMO_EMAIL, f"/outfits/{ai[0]['id']}", expected=404)
            if tasks:
                isolation["demo_get_ui_task"] = await get(DEMO_EMAIL, f"/tasks/{tasks[0]['id']}", expected=404)
            check("cross_account_resources_return_404", len(isolation) == 4 and all(status == 404 for status in isolation.values()), isolation)
        report["api"] = api_evidence
        await db.rollback()
    report["passed"] = all(c["passed"] for c in report["checks"])
    report["check_count"] = len(report["checks"])
    report["finished_at"] = datetime.now(timezone.utc).isoformat()
    return report


async def main():
    try:
        result = await verify()
        print(json.dumps(result, ensure_ascii=False, indent=2, default=serializable))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
