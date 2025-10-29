# 🍽️ HungryHive - Smart Group Dining Platform

Try it out here 👉 [![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://hungryhive-website.onrender.com)

<!-- [![License](https://img.shields.io/badge/license-MIT-green)]() -->

**HungryHive** is an AI-powered group dining decision platform that eliminates the "Where should we eat?" dilemma. Using machine learning clustering, Google Gemini AI, and real-time location data, it analyzes group preferences and recommends restaurants that maximize everyone's satisfaction.

---

## 🎯 Problem Statement

Group dining decisions are notoriously difficult:
- Conflicting food preferences (veg vs non-veg, spice levels, cuisines)
- Different hunger levels and dietary restrictions
- Geographic dispersion of group members
- Difficulty balancing everyone's desires democratically

**HungryHive solves this** by scientifically analyzing preferences, finding geographic centroids, and suggesting restaurants that cater to the entire group's needs.

---

## ✨ Key Features

### 🤖 **AI & Machine Learning**
- **K-Means Clustering**: Groups members by similar preferences
- **PCA Visualization**: 2D plot showing preference clusters
- **Google Gemini AI**: Interprets cluster patterns into human-readable recommendations
- **Dynamic Cluster Optimization**: Uses Elbow Method + Silhouette Score to find optimal groupings

### 📍 **Location Intelligence**
- **HTML5 Geolocation**: Captures each member's real-time location
- **Centroid Calculation**: Finds the geographic midpoint of the group
- **SerpAPI Integration**: Fetches top-rated restaurants near the group
- **Google Maps Integration**: Direct links to search results and individual restaurants

### 👥 **Real-Time Collaboration**
- **Firebase Realtime Database**: Instant sync across all devices
- **Live Voting System**: Democratic restaurant selection with vote counts
- **Group Management**: Create/join groups with unique IDs
- **Member Dashboard**: See who's joined and their key preferences

### 🎲 **Decision Tools**
- **Voting Mechanism**: Each member votes for preferred restaurants
- **Random Picker**: Animated random selection to break ties
- **Visual Highlights**: Winner restaurant gets highlighted styling

### 📱 **Modern UX**
- **Responsive Design**: Works seamlessly on mobile, tablet, and desktop
- **PWA-Ready**: Service worker and manifest for app-like experience
- **Toast Notifications**: Friendly feedback for user actions
- **Smooth Scrolling**: Animated section navigation

---

## 🛠️ Technology Stack

### **Frontend**
- **Core**: JavaScript, HTML5, CSS
- **Database**: Firebase Realtime Database SDK
- **APIs**: HTML5 Geolocation API
- **UI**: Custom CSS,
- **Progressive**: Service Worker, Web App Manifest

### **Backend**
- **Framework**: Flask (Python)
- **ML/AI Libraries**:
  - `scikit-learn` - KMeans, PCA, StandardScaler
  - `kneed` - Elbow point detection
  - `google-generativeai` - Gemini 2.5 Flash model
- **Data Processing**: `pandas`, `numpy`
- **APIs**: 
  - SerpAPI (Google Maps restaurant search)
  - Google Generative AI (Gemini)
- **Visualization**: `matplotlib` (cluster plots)
- **CORS**: `flask-cors`

### **Infrastructure**
- **Hosting**: Render (both frontend and backend)
- **Database**: Firebase Realtime Database (Google Cloud)
- **External APIs**: SerpAPI, Google AI Studio

---

## 📋 Prerequisites

### **API Keys Required**
1. **Firebase Project** (free tier sufficient)
   - Create project at [Firebase Console](https://console.firebase.google.com/)
   - Enable Realtime Database
   - Get configuration object

2. **Google AI API Key** (Gemini)
   - Get from [Google AI Studio](https://aistudio.google.com/apikey)
   - Free tier: 15 requests/minute

3. **SerpAPI Key** (Restaurant Search)
   - Sign up at [SerpAPI](https://serpapi.com/)
   - Free tier: 100 searches/month

### **Software Requirements**
- **Backend**: Python 3.8+, pip
- **Frontend**: Modern web browser (Chrome, Firefox, Safari, Edge)
- **Optional**: Node.js (for local development server)

---

## 🎮 Usage Guide

### **Step 1: Create/Join Group**
1. Open the application
2. Click **"Create New Group"** to generate a unique group ID
3. Share the group ID with friends
4. Others click **"Join Existing Group"** and enter the ID

### **Step 2: Add Preferences**
Each member:
1. Enters their name
2. Clicks **"Use Current Location"** (grants location permission)
3. Sets cuisine cravings using sliders (0-5 scale)
4. Selects hunger level (Light/Medium/Heavy)
5. Chooses drink preferences (optional)
6. Indicates dietary restriction (Veg/Non-Veg)
7. Sets spice tolerance (1-5 scale)
8. Clicks **"Add Me to Group"**

### **Step 3: Generate Recommendations**
1. Navigate to **"Group Dashboard"** section
2. Verify all members have joined (check member count)
3. Ensure all have location captured (green 📍 icon)
4. Click **"Find Restaurants!"** button
5. Wait 5-10 seconds for AI analysis

### **Step 4: Vote or Pick**
**Option A - Democratic Voting:**
1. Review the AI summary message
2. Check the top 5 restaurant options
3. Each member clicks "Vote 👍" on preferred restaurants
4. Vote counts update in real-time
5. Highest vote wins

**Option B - Random Selection:**
1. Click **"Pick Randomly!"** button
2. System animates selection
3. Winner is highlighted in yellow

### **Step 5: Visit Restaurant**
- Click restaurant name (blue link) to open Google Maps
- Use the generated Maps URL to see all nearby options
- Navigate to chosen location

---

## 🧠 How It Works (Technical Deep Dive)

### **Machine Learning Pipeline**

#### 1. Data Collection
```python
# Each user submits 20+ data points:
{
  "name": "Alice",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "hunger_level": 3,
  "spice_level": 2,
  "indian_craving": 5,
  "italian_craving": 4,
  # ... 8 cuisines total
  "diet": "Veg",
  "drink_preferences": { "mocktail": "Virgin Mojito", ... }
}
```

#### 2. Feature Engineering
- Extracts numeric columns (cravings, hunger, spice)
- Handles missing values (fills with 0)
- Standardizes features using `StandardScaler` (mean=0, std=1)

#### 3. Clustering
```python
# Optimal k determination:
for k in range(2, 7):
    kmeans = KMeans(n_clusters=k, random_state=42)
    labels = kmeans.fit_predict(scaled_data)
    inertias.append(kmeans.inertia_)  # Within-cluster variance
    silhouette_scores.append(silhouette_score(scaled_data, labels))

# Choose k based on Elbow + Silhouette consensus
best_k = optimize_clusters(inertias, silhouette_scores)
```

#### 4. Cluster Analysis
For each cluster:
- Calculates average cuisine cravings
- Summarizes diet breakdown (% veg vs non-veg)
- Lists member names
- Computes aggregate preferences

#### 5. AI Interpretation
```python
prompt = f"""
Analyze these dining clusters:
{cluster_summary_json}

Recommend 1-2 specific cuisines considering:
- Cuisine craving averages
- Hunger levels across clusters
- Diet restrictions

Return JSON: {{"recommendation": "Italian", "friendlyMessage": "...", "searchQuery": "..."}}
"""
response = gemini_model.generate_content(prompt)
```

### **Restaurant Discovery Pipeline**

#### 1. Centroid Calculation
```python
avg_lat = mean([user.latitude for user in group])
avg_lon = mean([user.longitude for user in group])
```

#### 2. SerpAPI Query
```python
params = {
    "engine": "google_maps",
    "q": f"{ai_recommended_cuisine} restaurants",
    "ll": f"@{avg_lat},{avg_lon},14z",  # Center + zoom
    "type": "search",
    "api_key": SERPAPI_KEY
}
results = GoogleSearch(params).get_dict()
```

#### 3. Data Extraction
```python
for place in results['local_results'][:5]:
    restaurants.append({
        "name": place['title'],
        "rating": place['rating'],
        "address": place['address'],
        "gps_coordinates": place['gps_coordinates'],
        "link": place['link']  # Direct Maps link
    })
```

### **Real-Time Voting System**

#### Firebase Structure
```
groups/
  FF-abc123/
    members/
      -MemberKey1: { name: "Alice", latitude: 12.97, ... }
      -MemberKey2: { name: "Bob", latitude: 12.98, ... }
    votes/
      Restaurant_Name_12_97_77_59/
        count: 3
      Another_Restaurant_12_98_77_60/
        count: 5
```

#### Vote Handling
```javascript
// Transaction ensures atomic increment (no race conditions)
voteRef.transaction(currentCount => (currentCount || 0) + 1);

// Real-time listener updates UI instantly
voteRef.on('value', snapshot => {
  const count = snapshot.val() || 0;
  document.getElementById(`votes-${key}`).textContent = `Votes: ${count}`;
});
```

---

## 🏗️ Project Structure

```
HUNGRYHIVE/
├── backend/
│   ├── app.py                 # Flask backend (400+ lines)
│   ├── ML_clustering.ipynb    # Jupyter notebook for ML
│   ├── requirements.txt       # Python dependencies
│   └── Procfile               # For deployment (Heroku, Render, etc.)
│
├── frontend/
│   ├── index.html             # Main HTML structure
│   ├── css/
│   │   └── style.css          # Complete styling
│   ├── js/
│   │   ├── app.js             # Frontend logic (2000+ lines)
│   │   └── user_preferences.json
│   ├── images/
│   │   └── 9805766.jpg        # Landing page
│   │    background
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker for offline use
│
├── .gitignore
└── README.md

```
---
## 👨‍💻 Authors

**HungryHive Team**
- GitHub: [@Sahiti3636](https://github.com/Sahiti3636)  [@Navya2208](https://github.com/Navya2208) [@Varun-iiitb](https://github.com/Varun-iiitb) 
---
