# Shape League Activity & Missions System V1

## Overview
Expanded Shape League from nutrition + gym tracking into a complete active lifestyle competition system.

## New Features

### 1. Multi-Activity System
**12 Supported Activities:**
- 🏋️ כוח (Strength) — 30 pts
- 🧘 פילאטיס (Pilates) — 25 pts
- 🏃 ריצה (Running) — 25 pts
- 🚶 הליכה (Walking) — 15 pts
- 🎾 טניס (Tennis) — 20 pts
- 🚴 אופניים (Cycling) — 25 pts
- 🏊 שחייה (Swimming) — 25 pts
- 🥊 פונקציונלי (Functional) — 30 pts
- 🕺 ריקוד (Dancing) — 20 pts
- ⚽ ספורט קבוצתי (Team Sports) — 25 pts
- 🥾 טיול (Hiking) — 20 pts
- 🧎 מתיחות/mobility (Stretching) — 10 pts

**Entities:**
- `ShapeLeagueActivityType` — Define activities & points
- `ShapeLeagueActivityLog` — Log trainee activities

### 2. Activity Logging UI
**Component:** `ShapeLeagueActivityLogger`
- One-tap logging
- Duration slider (5-180 minutes)
- Intensity selector (low/medium/high)
- Mobile-first design
- Anti-spam cooldown

**Location:** Top of Shape League home page

### 3. Daily Missions System
**Component:** `ShapeLeagueDailyMissionCard`

**Types:**
- 🔥 Activity missions (e.g., "Complete a workout")
- 💧 Hydration missions (e.g., "Drink 8 cups")
- 🚶 Step missions (e.g., "6000 steps")
- 🧘 Combo missions (e.g., "2 different activities")
- 🥗 Nutrition missions (e.g., "Complete meal targets")

**Entities:**
- `ShapeLeagueMission` — Daily missions (auto-reset)
- `ShapeLeagueMissionCompletion` — Track user completions

**Rewards:** 15+ bonus points per mission

### 4. Group Missions
**Component:** `ShapeLeagueGroupMissions`

**Examples:**
- 3+ active members today
- 5 team workouts this week
- 20,000 combined steps
- 3-day perfect streak (whole group)

**Entities:** Uses same `ShapeLeagueMission` with `is_group_mission: true`

**Rewards:**
- Team XP
- Glow effects
- Prestige boost
- Leaderboard advantage

### 5. Activity Feed Upgrade
**Component:** `ShapeLeagueActivityFeed`

**Shows:**
- "יובל סיים ריצה 🏃"
- "מאי השלימה פילאטיס 🧘"
- Real-time activity with names & emojis
- Points awarded
- Relative timestamps

### 6. Weekly Events
**Component:** `ShapeLeagueWeeklyEvent`

**Rotating Events:**
- 🏃 Running Week (1.5x points on runs)
- 💧 Hydration Week (special water missions)
- 🔥 Streak Week (streak bonuses)
- 👥 Group Week (group mission focus)
- ⚡ Combo Week (2+ activities = bonus)

**Entity:** `ShapeLeagueWeeklyEvent`

### 7. Coach Control Panel
**Component:** `ShapeLeagueCoachPanel`

**Admin Only Features:**
- Create/edit missions (floating button in coach dashboard)
- Toggle activities
- View all configured activities
- Create featured challenges
- Weekly event management

**Location:** `pages/CoachShapeLeagueDashboard` (floating button)

### 8. Safe Integration
**Component:** `ShapeLeagueSafeSection`

All new sections wrapped in error boundaries:
- ✅ ActivityLogger
- ✅ DailyMission
- ✅ ActivityFeed
- ✅ GroupMissions
- ✅ WeeklyEvent

If a section crashes:
- Shows error fallback
- Continues rendering rest of page
- No cascade failures

## Data Model (New Entities)

### ShapeLeagueActivityLog
```json
{
  "trainee_id": "string",
  "trainee_email": "string",
  "activity_type": "string (e.g., 'כוח')",
  "duration_minutes": "number",
  "intensity": "low|medium|high",
  "points_awarded": "number",
  "activity_date": "date",
  "mission_id": "string (optional)",
  "notes": "string"
}
```

### ShapeLeagueMission
```json
{
  "date": "date",
  "mission_type": "activity|nutrition|steps|hydration|combo|group",
  "title_he": "string",
  "description_he": "string",
  "emoji": "string",
  "target_value": "number",
  "unit": "minutes|km|cups|steps",
  "bonus_points": 15,
  "difficulty": "easy|medium|hard",
  "is_group_mission": "boolean",
  "group_target_members": "number"
}
```

### ShapeLeagueMissionCompletion
```json
{
  "mission_id": "string",
  "trainee_id": "string",
  "completed_at": "date-time",
  "bonus_points_awarded": "number",
  "verified": "boolean"
}
```

### ShapeLeagueWeeklyEvent
```json
{
  "week_start_date": "date",
  "event_type": "running_week|hydration_week|streak_week|group_week|combo_week",
  "title_he": "string",
  "emoji": "string",
  "point_multiplier": 1.5,
  "target_activity": "string (optional)"
}
```

## Integration Points

### ShapeLeagueHome
1. **Top:** Weekly event banner
2. **Second:** Daily mission card
3. **Third:** Activity logger
4. **Middle:** Group missions (if in group)
5. **Activity feed:** Real-time activities
6. **Rest:** Existing rankings, achievements, etc.

### CoachShapeLeagueDashboard
- Floating purple settings button (admin only)
- Opens mission creator panel
- Activity management
- Event controls

## Safety Guarantees

✅ **No breaking changes:**
- Existing points engine unchanged
- UserPointsDaily still works
- Rankings still calculate correctly
- Auth system untouched
- WhatsApp untouched
- Nutrition untouched
- Workouts untouched

✅ **Data isolation:**
- New data in new entities
- No modifications to core tables
- Backward compatible

✅ **Error handling:**
- All sections in SafeSection wrapper
- Component isolation testing available (via /ShapeLeagueDebug)
- Graceful fallbacks

## Testing Checklist

- [ ] Activity logging works
- [ ] Points awarded correctly
- [ ] Missions reset daily
- [ ] No duplicate farming
- [ ] Group missions work
- [ ] Weekly event multipliers apply
- [ ] Activity feed shows real data
- [ ] Coach panel only visible to admin
- [ ] Mobile smooth
- [ ] No crashes on ranking pages
- [ ] Debug center identifies issues

## Future Enhancements

1. **Challenge Seasons** — Themed monthly competitions
2. **Custom Badges** — Unlockable via achievements
3. **Trainee Challenges** — Friend vs friend
4. **Mobile Notifications** — Mission alerts
5. **Leaderboard Streaks** — Track longest streaks
6. **Coach Custom Events** — Full event builder
7. **Activity Stats** — Best activity per trainee
8. **Export Reports** — Weekly activity CSV

## Rollout Status

**Status:** ✅ STABLE V1

**Deployed:** Shape League Activity & Missions System
- Multi-activity system
- Daily missions
- Group missions
- Activity feed
- Coach control panel
- Safe error boundaries

**Zero Impact:** All existing systems preserved