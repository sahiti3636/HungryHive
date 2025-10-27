import os
import pandas as pd
import numpy as np
from flask import Flask, request, jsonify, abort
from flask_cors import CORS
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from kneed import KneeLocator
from sklearn.metrics import silhouette_score
import matplotlib
matplotlib.use('Agg') # Prevent Matplotlib GUI errors
import matplotlib.pyplot as plt
import io
import base64
import json
import google.generativeai as genai
from urllib.parse import quote_plus # For URL encoding
from serpapi import GoogleSearch  # <-- NEW IMPORT



# # ---  NEW FUNCTION: Fetch top 5 restaurants using SerpAPI ---
# def get_top_restaurants_serpapi(lat, lon, query="restaurants", limit=5):
#     try:
#         params = {
#             "engine": "google_maps",
#             "q": query,
#             "ll": f"@{lat},{lon},14z",  # Centered at centroid
#             "type": "search",
#             "api_key": SERPAPI_KEY
#         }
#         search = GoogleSearch(params)
#         results = search.get_dict()
#         places = results.get("local_results", [])

#         top_results = []
#         for place in places[:limit]:
#             top_results.append({
#                 "name": place.get("title"),
#                 "rating": place.get("rating"),
#                 "address": place.get("address"),
#                 "type": place.get("type"),
#                 "gps_coordinates": place.get("gps_coordinates"),
#                 "link": place.get("link")  # Direct Maps link
#             })
#         return top_results
#     except Exception as e:
#         print(f"SerpAPI Error: {e}")
#         return []


# Read keys from environment variables set on the server
SERPAPI_KEY = os.environ.get("SERPAPI_API_KEY", None) 
GOOGLE_AI_API_KEY = os.environ.get("GOOGLE_AI_API_KEY", None)

# Add checks later to ensure keys are loaded
if not SERPAPI_KEY or not GOOGLE_AI_API_KEY:
    print("WARNING: API keys not found in environment variables!")

# --- 2. FLASK APP SETUP ---
app = Flask(__name__)
CORS(app) # Enable Cross-Origin Resource Sharing

# --- 3. HELPER: Calculate Centroid ---
def calculate_centroid(user_data):
    """Calculates the average latitude and longitude for the group."""
    latitudes = []
    longitudes = []
    for user in user_data:
        lat = user.get('latitude')
        lon = user.get('longitude')
        # Check if lat and lon are valid numbers
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
             latitudes.append(lat)
             longitudes.append(lon)
        else:
            print(f"Warning: Invalid/Missing location for user {user.get('name', 'Unknown')}")

    if not latitudes or not longitudes:
        print("Error: No valid location data found for any user.")
        return None # Cannot calculate if location data is missing

    avg_lat = np.mean(latitudes)
    avg_lon = np.mean(longitudes)
    return avg_lat, avg_lon

# --- 4. ML CLUSTERING & PLOTTING LOGIC (Based on your Notebook) ---
def run_clustering_and_plot(data):
    """
    Performs clustering, analysis, and plotting based on the notebook logic.
    """
    df = pd.DataFrame(data)
    processed_df = df.copy() # Keep original df for analysis later

    # --- Feature Engineering & Data Preprocessing ---
    exclude_cols = ['name', 'diet', 'drink_preferences', 'latitude', 'longitude']
    preference_cols = [col for col in df.columns if col not in exclude_cols]
    craving_cols = [col for col in preference_cols if col.endswith('_craving')]
    processed_df[preference_cols] = processed_df[preference_cols].fillna(0)
    X_features = processed_df[preference_cols]

    # --- Scaling ---
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_features)

    # --- Determine optimal k ---
    best_k = 4 # Default value
    max_k = min(7, len(df))
    if max_k <= 2:
        best_k = max(1, len(df))
    else:
        K_range = range(2, max_k)
        inertias = []
        sil_scores = []
        for k_test in K_range:
            kmeans_test = KMeans(n_clusters=k_test, random_state=42, n_init=10)
            labels_test = kmeans_test.fit_predict(X_scaled)
            inertias.append(kmeans_test.inertia_)
            if len(set(labels_test)) > 1:
                 sil_scores.append(silhouette_score(X_scaled, labels_test))
            else:
                 sil_scores.append(-1)
        if K_range and inertias:
             knee = KneeLocator(K_range, inertias, curve="convex", direction="decreasing")
             best_k_elbow = knee.knee
        else:
             best_k_elbow = None
        if sil_scores:
             best_k_silhouette = K_range[np.argmax(sil_scores)]
        else:
             best_k_silhouette = K_range[0] if K_range else best_k
        if best_k_elbow is None:
            best_k = best_k_silhouette
        else:
            best_k = best_k_silhouette if abs(best_k_elbow - best_k_silhouette) <= 1 else best_k_elbow
        best_k = max(1, best_k)
    print(f"Chosen number of clusters (k) = {best_k}")

    # --- Final K-Means Clustering ---
    if best_k == 1:
         df['cluster'] = 0
    else:
        kmeans_final = KMeans(n_clusters=best_k, random_state=42, n_init=10)
        df['cluster'] = kmeans_final.fit_predict(X_scaled)

    # --- Cluster Analysis ---
    cluster_summary_list = []
    drinking_cols = ['mocktail', 'juice', 'cocktail', 'alcohol']
    for cluster_id in sorted(df['cluster'].unique()):
        cluster_data = df[df['cluster'] == cluster_id]
        drinks_data_reconstructed = {}
        for index, row in cluster_data.iterrows():
            name = row['name']
            prefs = {}
            original_prefs = row.get('drink_preferences')
            if isinstance(original_prefs, dict):
                 for drink_type in drinking_cols:
                      prefs[drink_type] = original_prefs.get(drink_type, None)
            drinks_data_reconstructed[name] = prefs
        valid_craving_cols = [col for col in craving_cols if col in cluster_data.columns]
        cuisine_avgs = cluster_data[valid_craving_cols].mean().sort_values(ascending=False)
        cuisine_avgs_dict = {str(k): round(float(v), 2) for k, v in cuisine_avgs.to_dict().items()}
        other_pref_cols = [col for col in preference_cols if '_craving' not in col]
        valid_other_cols = [col for col in other_pref_cols if col in cluster_data.columns]
        other_avgs = cluster_data[valid_other_cols].mean().sort_values(ascending=False)
        other_avgs_dict = {str(k): round(float(v), 2) for k, v in other_avgs.to_dict().items()}
        cluster_summary_list.append({
            "cluster_id": int(cluster_id),
            "members": cluster_data['name'].tolist(),
            "diet_breakdown": {str(k): int(v) for k, v in cluster_data['diet'].value_counts().to_dict().items()},
            "cuisine_craving_averages": cuisine_avgs_dict,
            "average_preferences": other_avgs_dict,
            "individual_drinking_preferences": drinks_data_reconstructed
        })

    # --- PCA Plot Generation ---
    pca = PCA(n_components=2)
    X_pca = pca.fit_transform(X_scaled)
    viz_df = pd.DataFrame(X_pca, columns=['PCA1', 'PCA2'])
    viz_df['cluster'] = df['cluster']
    viz_df['name'] = df['name']
    plt.figure(figsize=(10, 8))
    colors = plt.cm.get_cmap('tab10', best_k)
    for cluster_id in sorted(viz_df['cluster'].unique()):
        cluster_data_viz = viz_df[viz_df['cluster'] == cluster_id]
        plt.scatter(cluster_data_viz['PCA1'], cluster_data_viz['PCA2'],
                    color=colors(cluster_id % 10) if best_k > 1 else colors(0),
                    label=f"Cluster {cluster_id}", s=100)
    for i, row in viz_df.iterrows():
        plt.text(row['PCA1'] + 0.02, row['PCA2'] + 0.02, row['name'], fontsize=9)
    plt.title("Group Dining Preference Clusters (PCA Visualization)")
    plt.xlabel("PCA Component 1")
    plt.ylabel("PCA Component 2")
    if best_k > 1: plt.legend()
    plt.grid(True)
    img_buffer = io.BytesIO()
    plt.savefig(img_buffer, format='png', bbox_inches='tight')
    plt.close()
    img_buffer.seek(0)
    img_base64 = base64.b64encode(img_buffer.read()).decode('utf-8')

    # --- Save cluster summary ---
    try:
        summary_filename = "latest_cluster_summary.json"
        with open(summary_filename, "w") as f:
            json.dump(cluster_summary_list, f, indent=4)
        print(f"Cluster summary saved to {summary_filename}")
    except Exception as e:
        print(f"Error saving cluster summary to JSON: {e}")

    return cluster_summary_list, img_base64


# --- 5. AI RECOMMENDATION LOGIC ---
def get_ai_recommendation(analysis_list):
    """
    Calls Google Gemini to get recommendation (cuisine + search query template).
    """
    if ai_model is None:
        raise Exception("Google AI Model is not initialized.")

    analysis_json_string = json.dumps(analysis_list, indent=2)

    # Prompt asking for 1-2 cuisines, message, and search query template
    prompt = f"""
    You are an expert group dining assistant.
    A group's preferences have been analyzed by an ML model into the following clusters:

    {analysis_json_string}

    Based on this analysis (focus on 'cuisine_craving_averages', 'average_preferences' including 'hunger_level', and 'diet_breakdown' across *all* clusters), your task is to:

    1.  **Identify Top Cuisines Considering Hunger:** Determine the **top ONE or TWO specific cuisines** (e.g., "Indian", "Italian", "Pan-Asian", "Mexican") that best satisfy the group. Factor in both the 'cuisine_craving_averages' *and* the average 'hunger_level' for each cluster. If one cuisine strongly dominates, suggest only one. If the group is split, suggest two balanced options. Avoid generic terms like "Multi-Cuisine" unless essential.
    2.  **Write a friendly message:** Briefly explain the group's preference patterns and *clearly state the top cuisine(s)*.
    3.  **Provide a Google Maps search query:** Create a simple query using the recommended cuisine(s) and the placeholder "near [location]". Examples: "Indian restaurants near [location]", "Indian or Italian restaurants near [location]".

    Return your answer *only* as a JSON object with the keys:
    "friendlyMessage", "recommendation" (cuisine(s)), "searchQuery".
    """
    try:
        response = ai_model.generate_content(prompt)
        # ... (Robust JSON cleaning) ...
        response_text = response.text
        json_start = response_text.find('{')
        json_end = response_text.rfind('}')
        if json_start != -1 and json_end != -1: clean_response = response_text[json_start:json_end+1]
        else: clean_response = response_text.replace("```json", "").replace("```", "").strip()
        ai_output = json.loads(clean_response)
        # ... (Validation for searchQuery placeholder) ...
        if "searchQuery" in ai_output:
             query = ai_output["searchQuery"]
             placeholder = "near [location]"
             if not query.endswith(placeholder):
                 if placeholder not in query: ai_output["searchQuery"] = f"{query} {placeholder}"
                 elif not query.strip().endswith(placeholder.strip()):
                      rec_type = ai_output.get("recommendation", "restaurants")
                      ai_output["searchQuery"] = f"{rec_type} {placeholder}"
        if "recommendation" not in ai_output: ai_output["recommendation"] = "restaurants"
        return ai_output
    except Exception as e:
        print(f"Google AI API Error or JSON parsing error: {e}")
        # ... (Fallback response) ...
        return { "friendlyMessage": "AI error. Try 'Indian or Italian'?", "recommendation": "Indian or Italian", "searchQuery": "Indian or Italian restaurants near [location]" }


# # --- 6. THE API ENDPOINT (Generates URL) ---
# @app.route('/analyze', methods=['POST'])
# def analyze_preferences():
#     try:
#         user_data = request.json
#         print("\n--- Received User Data ---")
#         if not user_data or not isinstance(user_data, list) or len(user_data) == 0:
#             abort(400, "Invalid or empty data provided.")

#         # Step A: Run ML clustering and get plot
#         analysis_results_list, plot_image = run_clustering_and_plot(user_data)

#         # Step B: Get AI recommendation (cuisine type & search query template)
#         ai_recommendation = get_ai_recommendation(analysis_results_list)
#         print("\n--- AI Recommendation ---")
#         print(json.dumps(ai_recommendation, indent=2))

#         # Step C: Calculate Centroid
#         centroid = calculate_centroid(user_data)
#         print(f"\nCalculated Centroid: {centroid}")

#         # Step D1: Fetch top 5 restaurants using SerpAPI
#         if centroid:
#             avg_lat, avg_lon = centroid
#             cuisine_query = ai_recommendation.get("recommendation", "restaurants")
#             top5_restaurants = get_top_restaurants_serpapi(avg_lat, avg_lon, cuisine_query, limit=5)
#         else:
#             top5_restaurants = []

#         # Step D: Generate Google Maps URL
#         maps_url = ""
#         ai_search_query_template = ai_recommendation.get("searchQuery", "restaurants near [location]")
#         display_recommendation = ai_recommendation.get("recommendation", "restaurants") # For link text

#         # Prepare URL-safe search term by removing placeholder
#         search_term_only = ai_search_query_template.replace("near [location]", "").strip()
#         encoded_search_term = quote_plus(search_term_only)

#         if centroid:
#             avg_lat, avg_lon = centroid
#             zoom_level = 14
#             # Use the ll= and z= format for better centering
#             maps_url = f"https://www.google.com/maps/search/?api=1&query=${encoded_search_term}&ll={avg_lat:.6f},{avg_lon:.6f}&z={zoom_level}"
#             print(f"Generated Maps URL with Centroid: {maps_url}")
#         else:
#             # Fallback to "near me" search if centroid fails
#             fallback_query = f"{search_term_only} near me"
#             encoded_fallback_query = quote_plus(fallback_query)
#             maps_url = f"https://www.google.com/maps/search/?api=1&query=${encoded_fallback_query}"
#             print("Warning: Could not calculate centroid. Generating 'near me' URL.")

#         # Add the generated URL and update searchQuery for display
#         ai_recommendation["mapsUrl"] = maps_url
#         ai_recommendation["searchQuery"] = display_recommendation # Use base term for display

#         # Step E: Send results back to frontend
#         return jsonify({
#             "clusterSummary": analysis_results_list,
#             "plotBase64": plot_image,
#             "aiRecommendation": ai_recommendation, # Includes mapsUrl and base searchQuery
#             "topRestaurants": top5_restaurants
#         })

#     except ValueError as ve:
#          print(f"Data error: {ve}")
#          abort(400, f"Data error: {ve}")
#     except Exception as e:
#         print(f"Error during analysis: {e}")
#         import traceback
#         traceback.print_exc()
#         abort(500, "Internal server error during analysis.")

def get_top_restaurants_serpapi(lat, lon, query="restaurants", limit=5):
    """
    Fetches top restaurants using SerpAPI google_maps engine.
    Handles single string or list of strings for query.
    """
    if not SERPAPI_KEY or SERPAPI_KEY.startswith("b006e747"): # Check if key is placeholder
         print("WARNING: Using placeholder SerpAPI key. Search will likely fail.")
         # You might want to return mock data here if the key is the placeholder
         # return [{'name': 'Mock Restaurant - API Key Needed', 'address': 'Update key in app.py', 'rating': 'N/A'}]

    # --- Prepare the search query string ---
    search_query_str = ""
    if isinstance(query, list):
        # Join list with " OR " for broader search if multiple cuisines recommended
        search_query_str = " OR ".join(query) + " restaurants" # Explicitly add "restaurants"
    elif isinstance(query, str):
        # Ensure "restaurants" is part of the query if it's just a cuisine
        if "restaurant" not in query.lower() and "food court" not in query.lower():
             search_query_str = f"{query} restaurants"
        else:
             search_query_str = query
    else:
        search_query_str = "restaurants" # Default fallback

    print(f"Attempting SerpAPI search near ({lat}, {lon}) with query: '{search_query_str}'")

    try:
        params = {
            "engine": "google_maps",
            "q": search_query_str, # Use the prepared string
            "ll": f"@{lat},{lon},14z",  # Centered at centroid with zoom
            "type": "search",
            "api_key": SERPAPI_KEY,
            "hl": "en" # Optional: set language to English for consistency
        }
        search = GoogleSearch(params)
        results = search.get_dict()

        # --- Debugging: Print the raw SerpAPI response ---
        print("\n--- Raw SerpAPI Response ---")
        print(json.dumps(results, indent=2))
        # -----------------------------------------------

        places = results.get("local_results", [])
        if not places:
             print("SerpAPI returned no 'local_results'. Check query or location.")
             # Maybe try a broader query if the specific one failed?
             if search_query_str != "restaurants":
                  print("Retrying with just 'restaurants'...")
                  return get_top_restaurants_serpapi(lat, lon, "restaurants", limit) # Recursive call with fallback
             else:
                  return [] # If even 'restaurants' fails, return empty

        top_results = []
        for place in places[:limit]:
            # Extract data carefully, using .get() with defaults
            gps = place.get("gps_coordinates", {})
            top_results.append({
                "name": place.get("title", "N/A"),
                "rating": place.get("rating"), # Keep original rating if present
                "address": place.get("address", "N/A"),
                "type": place.get("type", "N/A"),
                "gps_coordinates": { # Ensure nested structure
                     "latitude": gps.get("latitude"),
                     "longitude": gps.get("longitude")
                } if gps else None,
                "link": place.get("link") # Direct Maps link
            })
        print(f"Successfully processed {len(top_results)} results from SerpAPI.")
        return top_results

    except Exception as e:
        print(f"SerpAPI Error during request or processing: {e}")
        import traceback
        traceback.print_exc() # Print full traceback for detailed error
        return []

# --- UPDATED MAIN ENDPOINT ---
@app.route('/analyze', methods=['POST'])
def analyze_preferences():
    try:
        user_data = request.json
        if not isinstance(user_data, list) or len(user_data) == 0:
            abort(400, "Invalid data")

        analysis_results, plot_image = run_clustering_and_plot(user_data)
        ai_recommendation = get_ai_recommendation(analysis_results)
        centroid = calculate_centroid(user_data)
        print(f"Centroid: {centroid}")

        top5_restaurants = [] # Initialize
        maps_url = "" # Initialize

        if centroid:
            lat, lon = centroid
            # Use the 'recommendation' from AI for SerpAPI query (handles list or string)
            cuisine_query_for_serpapi = ai_recommendation.get("recommendation", "restaurants")
            top5_restaurants = get_top_restaurants_serpapi(lat, lon, cuisine_query_for_serpapi, 5)

            # Generate Maps URL based on AI's 'searchQuery' template
            search_query_template = ai_recommendation.get("searchQuery", "restaurants near [location]")
            search_term_only = search_query_template.replace("near [location]", "").strip()
            encoded_search = quote_plus(search_term_only)
            maps_url = f"https://www.google.com/maps/search/?api=1&query={encoded_search}&ll={lat:.6f},{lon:.6f}&z=14"
        else:
            # Fallback if no centroid
            print("No centroid calculated, cannot search SerpAPI or generate location-specific Maps URL.")
            top5_restaurants = []
            maps_url = "https://www.google.com/maps/search/?api=1&query=restaurants+near+me" # Generic Maps link

        # Add the maps URL back into the AI recommendation dict for the frontend
        ai_recommendation["mapsUrl"] = maps_url

        return jsonify({
            "clusterSummary": analysis_results,
            "plotBase64": plot_image,
            "aiRecommendation": ai_recommendation, # Includes mapsUrl
            "topRestaurants": top5_restaurants # The list from SerpAPI
        })
    except Exception as e:
        print(f"Error in /analyze endpoint: {e}")
        import traceback; traceback.print_exc()
        abort(500, str(e))

# --- (Run Server code remains the same) ---
if __name__ == '__main__':
    app.run(debug=True, port=5000)