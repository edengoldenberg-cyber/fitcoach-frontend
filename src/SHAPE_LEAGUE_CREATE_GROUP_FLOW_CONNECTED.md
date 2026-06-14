# Shape League Create Group Flow — Connected

## Problem Fixed
ShapeLeagueHome was rendering the full league dashboard immediately, auto-assigning users to random groups silently, without showing them:
- Create group option
- Join by code
- Onboarding choices
- Captain flow

This broke the entire social league vision by forcing users into groups without choice.

## Solution Implemented

### State Gates in ShapeLeagueHome

Users now follow a proper flow based on their group status:

**STATE A: First-time onboarding**
- Show: `ShapeLeagueWelcomeFlow`
- User chooses: Create → Join by code → Auto-assign
- Only after choice → mark onboarding_done

**STATE B: No group yet (onboarding_done)**
- Show: `LeagueEmptyState` (standalone view)
- Display three CTA options:
  - ➕ **צור קבוצה** → Link to `/ShapeLeagueCreateGroup`
  - 🎟️ **קוד הזמנה** → Inline code input (handled by LeagueEmptyState)
  - ⚡ **שיבוץ אוטומטי** → Trigger auto-assign (handled by LeagueEmptyState)
- No silent random assignment

**STATE C: Creating group**
- Route: `/ShapeLeagueCreateGroup`
- Flow:
  1. Enter group name
  2. Pick badge/icon
  3. Confirm → Create
  4. Creator becomes captain
  5. Show invite code (last 6 chars of group ID)
  6. Redirect to `/ShapeLeagueGroupProfile`

**STATE D: Already has group**
- ONLY THEN render full `ShapeLeagueHome` dashboard

### Header CTA Buttons

Added visible action buttons in league header:
```
➕ צור קבוצה (green)
🎟️ קוד הזמנה (blue)
```

Plus existing nav: חוקים | פרסים | טבלה | הישגים

### Removed Auto-Assign

**Before:**
```javascript
// Auto-assign silently on first visit
useEffect(() => {
  if (trainee?.id && myGroup === null && !loadingGroup && !assignAttempted.current) {
    assignAttempted.current = true;
    await base44.functions.invoke('assignUserToLeagueGroup', { ... })
  }
})
```

**After:**
```javascript
// Only track that user is awaiting choice
useEffect(() => {
  const status = myGroup ? `group: ${myGroup.id}` : 'awaiting user choice';
  startupTrace.ok('group_assignment_checked', status);
})
```

### LeagueEmptyState (Already Complete)

Component already has all three CTAs:
- ✅ Create group → `/ShapeLeagueCreateGroup`
- ✅ Auto-assign → `assignUserToLeagueGroup()` function
- ✅ Join by code → Inline code input + validation

File: `components/league/LeagueEmptyState.jsx`

## Code Changes

**File: `pages/ShapeLeagueHome.jsx`**
- Added STATE GATE comment for welcome flow (state A)
- Added STATE GATE for empty group (state B) → Shows LeagueEmptyState
- Removed auto-assign effect (was silent)
- Added header CTA buttons (create + code)
- Changed group assignment tracking to "awaiting user choice"

**File: `pages/ShapeLeagueCreateGroup.jsx`**
- Already fully implemented and wired
- Handles group creation with captain assignment
- Shows invite code on success
- Redirects to group profile

**Routes: Already in `App.jsx`**
- `/ShapeLeagueCreateGroup` → Properly wrapped with LayoutWrapper

## Expected UX

**First Entry to Shape League:**
1. User sees Welcome Flow (onboarding)
2. Chooses: Create | Join code | Auto-assign
3. If Create → Goes to create group page
   - Names group
   - Picks badge
   - Confirms → Becomes captain
   - Sees invite code
4. If Join code → Shows inline input
   - Enters code
   - Sees group preview
   - Joins
5. If Auto-assign → Gets random group
6. After any choice → Redirected to league home with group

**Subsequent Entries:**
- User has group → See full league dashboard
- User without group → See LeagueEmptyState (shouldn't happen after onboarding)

## Group Card Display

When user has group, card shows:
- ✅ Badge icon
- ✅ Group name (display_name)
- ✅ Member count
- ✅ Captain crown (👑 if user is captain)
- ✅ Clickable → Links to group profile

## Captain Controls

Captain can see (in group profile):
- Invite members
- Edit slogan/badge
- View group stats
- Manage members

## Final Status

✅ **SHAPE_LEAGUE_CREATE_GROUP_FLOW_CONNECTED**

Users now:
- Choose HOW to participate (not forced)
- See all options clearly
- Can create groups and become captains
- Can join groups by code
- Can auto-assign if they prefer
- No silent random assignment