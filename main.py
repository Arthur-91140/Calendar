from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import sqlite3
import hashlib
import jwt
import json
import uuid
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, List, Dict, Any
import asyncio

# Configuration
SECRET_KEY = "votre-cle-secrete-super-forte"  # À changer en production
ALGORITHM = "HS256"
DATABASE_PATH = "calendar.db"

# Configuration email (à adapter selon votre serveur SMTP)
EMAIL_CONFIG = {
    "smtp_server": "smtp.gmail.com",
    "smtp_port": 587,
    "email": "votre-email@gmail.com",
    "password": "votre-mot-de-passe-app"
}

app = FastAPI(title="Calendar API", version="2.0.0")

# CORS pour permettre les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production, spécifier les domaines autorisés
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servir les fichiers statiques (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Schémas Pydantic étendus
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class RecurrenceRule(BaseModel):
    frequency: str  # "daily", "weekly", "monthly", "yearly"
    interval: int = 1
    days_of_week: Optional[List[int]] = None  # 0=Monday, 6=Sunday
    day_of_month: Optional[int] = None
    end_type: str = "never"  # "never", "after", "until"
    end_after: Optional[int] = None
    end_until: Optional[str] = None

class NotificationSettings(BaseModel):
    email_enabled: bool = False
    email_minutes_before: int = 15
    push_enabled: bool = False
    push_minutes_before: int = 15

class EventCreate(BaseModel):
    title: str
    description: Optional[str] = None
    start_datetime: str
    end_datetime: str
    location: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = "#3174ad"
    is_all_day: Optional[bool] = False
    recurrence_rule: Optional[RecurrenceRule] = None
    notifications: Optional[NotificationSettings] = None

class EventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    location: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    is_all_day: Optional[bool] = None
    recurrence_rule: Optional[RecurrenceRule] = None
    notifications: Optional[NotificationSettings] = None

class LocationSettings(BaseModel):
    name: str
    address: Optional[str] = None
    is_favorite: bool = True

class ShareSettings(BaseModel):
    duration_days: int = 7
    anonymize: bool = False
    include_details: bool = True
    start_date: str

# Sécurité
security = HTTPBearer()

def init_db():
    """Initialise la base de données avec les nouvelles tables"""
    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()
    
    # Table des utilisateurs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            email_notifications BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Table des événements avec récurrence
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            start_datetime DATETIME NOT NULL,
            end_datetime DATETIME NOT NULL,
            location TEXT,
            category TEXT,
            color TEXT DEFAULT '#3174ad',
            is_all_day BOOLEAN DEFAULT 0,
            recurrence_rule TEXT,  -- JSON de la règle de récurrence
            notifications TEXT,    -- JSON des notifications
            parent_event_id INTEGER,  -- Pour les événements récurrents
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (parent_event_id) REFERENCES events (id)
        )
    ''')
    
    # Table des lieux favoris
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS favorite_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            is_favorite BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Table des partages
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS shared_calendars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            share_token TEXT UNIQUE NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            anonymize BOOLEAN DEFAULT 0,
            include_details BOOLEAN DEFAULT 1,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Table des notifications programmées
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scheduled_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            notification_type TEXT NOT NULL,  -- 'email' ou 'push'
            scheduled_for DATETIME NOT NULL,
            sent BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (event_id) REFERENCES events (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Table de synchronisation
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_id INTEGER,
            action TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            device_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (event_id) REFERENCES events (id)
        )
    ''')
    
    conn.commit()
    conn.close()

def get_db():
    """Connexion à la base de données"""
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    """Hash un mot de passe"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_token(user_id: int) -> str:
    """Crée un token JWT"""
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Récupère l'utilisateur actuel depuis le token"""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token invalide")
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Token invalide")

def generate_recurring_events(event_data: dict, recurrence: RecurrenceRule, max_occurrences: int = 100):
    """Génère les événements récurrents"""
    events = []
    start_dt = datetime.fromisoformat(event_data['start_datetime'].replace('Z', '+00:00'))
    end_dt = datetime.fromisoformat(event_data['end_datetime'].replace('Z', '+00:00'))
    duration = end_dt - start_dt
    
    current_dt = start_dt
    count = 0
    
    while count < max_occurrences:
        if recurrence.end_type == "after" and count >= recurrence.end_after:
            break
        if recurrence.end_type == "until" and current_dt > datetime.fromisoformat(recurrence.end_until):
            break
            
        # Créer l'événement pour cette occurrence
        event_copy = event_data.copy()
        event_copy['start_datetime'] = current_dt.isoformat()
        event_copy['end_datetime'] = (current_dt + duration).isoformat()
        events.append(event_copy)
        
        # Calculer la prochaine occurrence
        if recurrence.frequency == "daily":
            current_dt += timedelta(days=recurrence.interval)
        elif recurrence.frequency == "weekly":
            if recurrence.days_of_week:
                # Logique pour jours spécifiques de la semaine
                days_ahead = []
                current_weekday = current_dt.weekday()
                for day in recurrence.days_of_week:
                    if day > current_weekday:
                        days_ahead.append(day - current_weekday)
                    else:
                        days_ahead.append(7 - current_weekday + day)
                
                if days_ahead:
                    current_dt += timedelta(days=min(days_ahead))
                else:
                    current_dt += timedelta(weeks=recurrence.interval)
            else:
                current_dt += timedelta(weeks=recurrence.interval)
        elif recurrence.frequency == "monthly":
            if current_dt.month == 12:
                current_dt = current_dt.replace(year=current_dt.year + 1, month=1)
            else:
                current_dt = current_dt.replace(month=current_dt.month + recurrence.interval)
        elif recurrence.frequency == "yearly":
            current_dt = current_dt.replace(year=current_dt.year + recurrence.interval)
        
        count += 1
    
    return events

async def send_email_notification(user_email: str, event_title: str, event_start: str):
    """Envoie une notification par email"""
    try:
        msg = MIMEMultipart()
        msg['From'] = EMAIL_CONFIG['email']
        msg['To'] = user_email
        msg['Subject'] = f"Rappel: {event_title}"
        
        body = f"""
        Bonjour,
        
        Ceci est un rappel pour votre événement:
        
        Titre: {event_title}
        Date: {event_start}
        
        Cordialement,
        Votre Calendrier Personnel
        """
        
        msg.attach(MIMEText(body, 'plain'))
        
        server = smtplib.SMTP(EMAIL_CONFIG['smtp_server'], EMAIL_CONFIG['smtp_port'])
        server.starttls()
        server.login(EMAIL_CONFIG['email'], EMAIL_CONFIG['password'])
        text = msg.as_string()
        server.sendmail(EMAIL_CONFIG['email'], user_email, text)
        server.quit()
        
        return True
    except Exception as e:
        print(f"Erreur envoi email: {e}")
        return False

# Routes d'authentification (inchangées)
@app.post("/api/register")
async def register(user: UserCreate):
    """Inscription d'un nouvel utilisateur"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM users WHERE username = ? OR email = ?", 
                   (user.username, user.email))
    if cursor.fetchone():
        raise HTTPException(status_code=400, detail="Utilisateur déjà existant")
    
    password_hash = hash_password(user.password)
    cursor.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (user.username, user.email, password_hash)
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    token = create_token(user_id)
    return {"token": token, "user_id": user_id}

@app.post("/api/login")
async def login(user: UserLogin):
    """Connexion d'un utilisateur"""
    conn = get_db()
    cursor = conn.cursor()
    
    password_hash = hash_password(user.password)
    cursor.execute(
        "SELECT id, email FROM users WHERE username = ? AND password_hash = ?",
        (user.username, password_hash)
    )
    user_row = cursor.fetchone()
    conn.close()
    
    if not user_row:
        raise HTTPException(status_code=401, detail="Identifiants incorrects")
    
    token = create_token(user_row[0])
    return {"token": token, "user_id": user_row[0], "email": user_row[1]}

# Routes des événements améliorées
@app.get("/api/events")
async def get_events(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: int = Depends(get_current_user)
):
    """Récupère les événements de l'utilisateur avec filtrage par date"""
    conn = get_db()
    cursor = conn.cursor()
    
    query = "SELECT * FROM events WHERE user_id = ?"
    params = [user_id]
    
    if start_date and end_date:
        query += " AND ((start_datetime BETWEEN ? AND ?) OR (end_datetime BETWEEN ? AND ?))"
        params.extend([start_date, end_date, start_date, end_date])
    
    query += " ORDER BY start_datetime"
    
    cursor.execute(query, params)
    events = []
    
    for row in cursor.fetchall():
        event = dict(row)
        # Parser les champs JSON
        if event['recurrence_rule']:
            event['recurrence_rule'] = json.loads(event['recurrence_rule'])
        if event['notifications']:
            event['notifications'] = json.loads(event['notifications'])
        events.append(event)
    
    conn.close()
    return events

@app.post("/api/events")
async def create_event(event: EventCreate, background_tasks: BackgroundTasks, user_id: int = Depends(get_current_user)):
    """Crée un nouvel événement avec support de récurrence"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Préparer les données de base
    event_data = {
        'user_id': user_id,
        'title': event.title,
        'description': event.description,
        'start_datetime': event.start_datetime,
        'end_datetime': event.end_datetime,
        'location': event.location,
        'category': event.category,
        'color': event.color,
        'is_all_day': event.is_all_day,
        'recurrence_rule': json.dumps(event.recurrence_rule.dict()) if event.recurrence_rule else None,
        'notifications': json.dumps(event.notifications.dict()) if event.notifications else None
    }
    
    created_events = []
    
    if event.recurrence_rule:
        # Générer les événements récurrents
        recurring_events = generate_recurring_events(event_data, event.recurrence_rule)
        
        for recurring_event in recurring_events:
            cursor.execute('''
                INSERT INTO events (user_id, title, description, start_datetime, end_datetime, 
                                   location, category, color, is_all_day, recurrence_rule, notifications)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (recurring_event['user_id'], recurring_event['title'], recurring_event['description'],
                  recurring_event['start_datetime'], recurring_event['end_datetime'], 
                  recurring_event['location'], recurring_event['category'], recurring_event['color'],
                  recurring_event['is_all_day'], recurring_event['recurrence_rule'], recurring_event['notifications']))
            
            event_id = cursor.lastrowid
            created_events.append(event_id)
            
            # Programmer les notifications
            if event.notifications:
                await schedule_notifications(cursor, event_id, user_id, recurring_event, event.notifications, background_tasks)
    else:
        # Événement unique
        cursor.execute('''
            INSERT INTO events (user_id, title, description, start_datetime, end_datetime, 
                               location, category, color, is_all_day, recurrence_rule, notifications)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (event_data['user_id'], event_data['title'], event_data['description'],
              event_data['start_datetime'], event_data['end_datetime'], 
              event_data['location'], event_data['category'], event_data['color'],
              event_data['is_all_day'], event_data['recurrence_rule'], event_data['notifications']))
        
        event_id = cursor.lastrowid
        created_events.append(event_id)
        
        # Programmer les notifications
        if event.notifications:
            await schedule_notifications(cursor, event_id, user_id, event_data, event.notifications, background_tasks)
    
    conn.commit()
    conn.close()
    
    return {"ids": created_events, "message": f"{len(created_events)} événement(s) créé(s)"}

async def schedule_notifications(cursor, event_id: int, user_id: int, event_data: dict, notifications: NotificationSettings, background_tasks: BackgroundTasks):
    """Programme les notifications pour un événement"""
    start_dt = datetime.fromisoformat(event_data['start_datetime'].replace('Z', '+00:00'))
    
    if notifications.email_enabled:
        notification_time = start_dt - timedelta(minutes=notifications.email_minutes_before)
        cursor.execute('''
            INSERT INTO scheduled_notifications (event_id, user_id, notification_type, scheduled_for)
            VALUES (?, ?, 'email', ?)
        ''', (event_id, user_id, notification_time.isoformat()))
    
    if notifications.push_enabled:
        notification_time = start_dt - timedelta(minutes=notifications.push_minutes_before)
        cursor.execute('''
            INSERT INTO scheduled_notifications (event_id, user_id, notification_type, scheduled_for)
            VALUES (?, ?, 'push', ?)
        ''', (event_id, user_id, notification_time.isoformat()))

# Routes pour les lieux favoris
@app.get("/api/locations")
async def get_favorite_locations(user_id: int = Depends(get_current_user)):
    """Récupère les lieux favoris de l'utilisateur"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT * FROM favorite_locations WHERE user_id = ? ORDER BY name",
        (user_id,)
    )
    locations = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return locations

@app.post("/api/locations")
async def add_favorite_location(location: LocationSettings, user_id: int = Depends(get_current_user)):
    """Ajoute un lieu favori"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO favorite_locations (user_id, name, address, is_favorite)
        VALUES (?, ?, ?, ?)
    ''', (user_id, location.name, location.address, location.is_favorite))
    
    location_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    return {"id": location_id, "message": "Lieu ajouté"}

@app.delete("/api/locations/{location_id}")
async def delete_favorite_location(location_id: int, user_id: int = Depends(get_current_user)):
    """Supprime un lieu favori"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM favorite_locations WHERE id = ? AND user_id = ?", (location_id, user_id))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Lieu non trouvé")
    
    conn.commit()
    conn.close()
    return {"message": "Lieu supprimé"}

# Routes de partage
@app.post("/api/share")
async def create_share_link(share_settings: ShareSettings, user_id: int = Depends(get_current_user)):
    """Crée un lien de partage pour le calendrier"""
    conn = get_db()
    cursor = conn.cursor()
    
    share_token = str(uuid.uuid4())
    start_date = datetime.fromisoformat(share_settings.start_date).date()
    end_date = start_date + timedelta(days=share_settings.duration_days)
    expires_at = datetime.now() + timedelta(days=30)  # Le lien expire après 30 jours
    
    cursor.execute('''
        INSERT INTO shared_calendars (user_id, share_token, start_date, end_date, 
                                     anonymize, include_details, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (user_id, share_token, start_date, end_date, 
          share_settings.anonymize, share_settings.include_details, expires_at))
    
    conn.commit()
    conn.close()
    
    return {
        "share_link": f"/shared/{share_token}",
        "expires_at": expires_at.isoformat()
    }

@app.get("/api/shared/{share_token}")
async def get_shared_calendar(share_token: str):
    """Récupère un calendrier partagé"""
    conn = get_db()
    cursor = conn.cursor()
    
    # Vérifier le token de partage
    cursor.execute('''
        SELECT sc.*, u.username FROM shared_calendars sc
        JOIN users u ON sc.user_id = u.id
        WHERE sc.share_token = ? AND sc.expires_at > datetime('now')
    ''', (share_token,))
    
    share_info = cursor.fetchone()
    if not share_info:
        raise HTTPException(status_code=404, detail="Lien de partage invalide ou expiré")
    
    share_info = dict(share_info)
    
    # Récupérer les événements dans la période partagée
    cursor.execute('''
        SELECT * FROM events 
        WHERE user_id = ? AND date(start_datetime) BETWEEN ? AND ?
        ORDER BY start_datetime
    ''', (share_info['user_id'], share_info['start_date'], share_info['end_date']))
    
    events = []
    for row in cursor.fetchall():
        event = dict(row)
        
        # Anonymiser si nécessaire
        if share_info['anonymize']:
            event['title'] = "Occupé"
            event['description'] = None
            event['location'] = None
        
        # Limiter les détails si nécessaire
        if not share_info['include_details']:
            event['description'] = None
        
        events.append(event)
    
    conn.close()
    
    return {
        "owner": share_info['username'] if not share_info['anonymize'] else "Utilisateur",
        "start_date": share_info['start_date'],
        "end_date": share_info['end_date'],
        "events": events
    }

# Autres routes inchangées...
@app.put("/api/events/{event_id}")
async def update_event(event_id: int, event: EventUpdate, user_id: int = Depends(get_current_user)):
    """Met à jour un événement"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id FROM events WHERE id = ? AND user_id = ?", (event_id, user_id))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Événement non trouvé")
    
    updates = []
    values = []
    for field, value in event.dict(exclude_unset=True).items():
        if field in ['recurrence_rule', 'notifications'] and value:
            value = json.dumps(value.dict() if hasattr(value, 'dict') else value)
        updates.append(f"{field} = ?")
        values.append(value)
    
    if updates:
        values.extend([event_id, user_id])
        query = f"UPDATE events SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
        cursor.execute(query, values)
        conn.commit()
    
    conn.close()
    return {"message": "Événement mis à jour"}

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: int, user_id: int = Depends(get_current_user)):
    """Supprime un événement"""
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("DELETE FROM events WHERE id = ? AND user_id = ?", (event_id, user_id))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Événement non trouvé")
    
    # Supprimer les notifications associées
    cursor.execute("DELETE FROM scheduled_notifications WHERE event_id = ?", (event_id,))
    
    conn.commit()
    conn.close()
    return {"message": "Événement supprimé"}

# Route pour servir le frontend
@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

@app.get("/shared/{share_token}")
async def read_shared_calendar(share_token: str):
    return FileResponse('static/shared.html')

# Initialisation au démarrage
@app.on_event("startup")
async def startup_event():
    init_db()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)