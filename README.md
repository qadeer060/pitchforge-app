# PitchForge — AI Instagram Outreach Tool

Upload a screenshot of any business's Instagram profile and up to 2 of their posts, enter the business name and industry, and get a personalised cold outreach DM powered by Google Gemini (free, no card required).

The message always:
- Compliments one real, specific thing from their account
- Points out one thing they could improve
- Explains how fixing it would grow their reach
- Offers one free post as a no-risk hook

Every message is tracked. Mark it won or lost and PitchForge automatically adjusts future messages based on your track record.

---

## Run locally

### 1. Install Python + Node.js (skip if done)
- Python: python.org/downloads (tick "Add to PATH" on Windows)
- Node.js: nodejs.org

### 2. Get a free Gemini API key
- Go to aistudio.google.com
- Sign in with a Google account
- Click "Get API Key" → "Create API key"
- Copy the key (starts with `AIza...`)
- No card needed. Free tier: 1,500 requests/day

### 3. Start the backend
Open Terminal, cd into the `backend` folder:
```
pip install -r requirements.txt
```
Then open the WSGI config or set these environment variables directly:
- SECRET_KEY — any random 30+ character string
- JWT_SECRET_KEY — a different random string
- GEMINI_API_KEY — your key from step 2

Run it:
```
python app.py
```
Leave this window open. Runs on port 5001.

### 4. Start the frontend
Open a second Terminal, cd into the `frontend` folder:
```
npm install
npm run dev
```
Open http://localhost:5173

---

## Deploy publicly (PythonAnywhere + Vercel)

### Backend on PythonAnywhere
1. Push this repo to GitHub
2. Log into pythonanywhere.com
3. Bash console: `git clone https://github.com/yourusername/pitchforge-app.git`
4. `cd pitchforge-app/backend && mkvirtualenv --python=/usr/bin/python3.10 pitchforge-env && pip install -r requirements.txt`
5. Web tab → Add new web app → Flask → Python 3.10
6. Set path to: `/home/yourusername/pitchforge-app/backend/app.py`
7. Set virtualenv to: `/home/yourusername/.virtualenvs/pitchforge-env`
8. Edit WSGI config file — replace contents with:

```python
import sys, os
path = '/home/yourusername/pitchforge-app/backend'
if path not in sys.path:
    sys.path.append(path)
os.environ['SECRET_KEY'] = 'your-random-string'
os.environ['JWT_SECRET_KEY'] = 'your-other-random-string'
os.environ['GEMINI_API_KEY'] = 'your-AIza-key-here'
os.environ['FLASK_DEBUG'] = 'false'
from app import app as application
```

9. Bash console: `mkdir -p ~/pitchforge-app/backend/uploads`
10. Reload — test at `yourusername.pythonanywhere.com/api/health`

### Frontend on Vercel
1. vercel.com → New Project → import your GitHub repo
2. Set Root Directory to `frontend`
3. Add environment variable: `VITE_API_URL` = your PythonAnywhere URL
4. Deploy — done.

---

## How the learning system works
Every generated message is saved with the business name, field, and full text. When you mark a message won or lost, that outcome is stored. On the next generation, PitchForge passes the last 30 messages (split by outcome) to Gemini as context — so it reinforces what's working and avoids what isn't, specific to your outreach style.
