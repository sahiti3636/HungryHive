// ==========================================
// FEASTFIT - SMART GROUP DINING PLATFORM
// Main Application Logic (Random Selection Version)
// ==========================================

// --- Get HTML Elements ---
const landingPage = document.getElementById('landingPage');
const createGroupBtn = document.getElementById('createGroupBtn');
const joinGroupBtn = document.getElementById('joinGroupBtn');
const groupIdInput = document.getElementById('groupIdInput');
const currentGroupInfo = document.getElementById('currentGroupInfo');
const displayGroupId = document.getElementById('displayGroupId');
const leaveGroupBtn = document.getElementById('leaveGroupBtn');
const appContent = document.getElementById('appContent');
const generateButton = document.getElementById('generateRecommendationsBtn');
const loadingText = document.getElementById('loading-text');
const resultsContent = document.getElementById('results-content');
const aiMessageDisplay = document.getElementById('ai-message');
const plotImage = document.getElementById('plot-image');
const preferencesForm = document.getElementById('preferencesForm');
const membersList = document.getElementById('membersList');
const memberCountBadge = document.getElementById('memberCountBadge');
const groupCount = document.getElementById('groupCount');
const restaurantList = document.getElementById('restaurant-list');
const randomPickButton = document.getElementById('randomPickBtn'); // Renamed
const randomResultDisplay = document.getElementById('randomResult'); // Renamed
const getLocationBtn = document.getElementById('getLocationBtn');
const locationStatus = document.getElementById('locationStatus');
const emptyResultsState = document.getElementById('empty-results-state');
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileMenu = document.getElementById('mobileMenu');


const firebaseConfig = {
    apiKey: "AIzaSyBsFaY2PHl85XmcRwHyYauvd8TWEal5Ke0",
    authDomain: "dining-4758f.firebaseapp.com",
    databaseURL: "https://dining-4758f-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dining-4758f",
    storageBucket: "dining-4758f.firebasestorage.app",
    messagingSenderId: "103999565945",
    appId: "1:103999565945:web:9fc90208d9addce52324a8",
    measurementId: "G-N022214V4G"
  };
  

// --- Initialize Firebase ---
let database = null;
try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig); else firebase.app();
    database = firebase.database();
    console.log("Firebase Initialized Successfully.");
} catch (error) {
    console.error("Firebase Initialization Error:", error);
    alert("Could not initialize Firebase. Voting will not work.");
}

// --- Global Variables ---
let groupMembers = [];
let currentGroupId = null;
let currentRestaurantOptions = [];
let isPickingRandomly = false;
let firebaseListeners = [];
let userLatitude = null;
let userLongitude = null;

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', initializeApp);

function initializeApp() {
    const savedGroupId = localStorage.getItem('feastfit_currentGroupId');
    if (savedGroupId) joinGroup(savedGroupId); else showLandingPage();
    initializeCommonUI();
    console.log('🍕 FeastFit initialized.');
}

function initializeCommonUI() {
    if (createGroupBtn) createGroupBtn.addEventListener('click', createNewGroup);
    if (joinGroupBtn) joinGroupBtn.addEventListener('click', handleJoinGroupClick);
    if (leaveGroupBtn) leaveGroupBtn.addEventListener('click', leaveGroup);
    // Attach listener for the random pick button here as it exists in the main HTML structure
    if (randomPickButton) {
         randomPickButton.addEventListener('click', startRandomPick);
         console.log("Random Pick button listener attached.");
    } else {
         console.error("Random Pick button (randomPickBtn) not found!");
    }
}

// ==================== LANDING PAGE / GROUP MANAGEMENT ====================
function showLandingPage() {
    if (landingPage) landingPage.style.display = 'flex';
    if (appContent) appContent.style.display = 'none';
    if (currentGroupInfo) currentGroupInfo.style.display = 'none';
    console.log("Showing Landing Page");
}

function showAppContent() {
    if (landingPage) landingPage.style.display = 'none';
    if (appContent) appContent.style.display = 'block';
    if (currentGroupInfo && currentGroupId) {
         if(displayGroupId) displayGroupId.textContent = currentGroupId;
         currentGroupInfo.style.display = 'block';
    } else if (currentGroupInfo) {
         currentGroupInfo.style.display = 'none';
    }
    // Initialize app-specific UI elements and listeners now that they are visible
    initializeAppSpecificUI();
    console.log("Showing App Content for group:", currentGroupId);
}

// Function to initialize UI elements inside #appContent
function initializeAppSpecificUI() {
    initializeSliders();
    initializeForm();
    initializeNavigation();
    initializeMobileMenu();
    initializeLocationButton();
    // Use correct button ID for generating recommendations
    const generateRecsButton = document.getElementById('generateRecommendationsBtn');
    if (generateRecsButton) {
         // Remove previous listener if exists to prevent duplicates
         generateRecsButton.removeEventListener('click', generateRecommendations);
         generateRecsButton.addEventListener('click', generateRecommendations);
         console.log("Generate Recs button listener attached.");
    } else { console.error("Generate Recs button not found in app content!"); }

    // Random pick listener is already attached in initializeCommonUI
    updateGroupUI(); // Refresh member list display for the current group
}


function generateGroupId() {
    return `FF-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

function createNewGroup() {
    const newGroupId = generateGroupId();
    console.log("Creating new group:", newGroupId);
    joinGroup(newGroupId);
}

function handleJoinGroupClick() {
    if (!groupIdInput) return;
    const groupIdToJoin = groupIdInput.value.trim();
    if (groupIdToJoin) {
        joinGroup(groupIdToJoin);
    } else {
        showToast("Please enter a Group ID.", "warning");
    }
}

function joinGroup(groupId) {
    console.log("Joining group:", groupId);
    // Detach listeners from any previous group FIRST
    detachFirebaseListeners(); 
    detachMemberListener(); // Detach old member listener if exists

    currentGroupId = groupId; // Set the global group ID
    localStorage.setItem('feastfit_currentGroupId', currentGroupId); // Save for next visit

    groupMembers = []; // **Clear local members array when joining**
    currentRestaurantOptions = []; // Clear previous options
    
    resetResultsArea(); // Clear out old results display visually

    // **Start listening for members in this group from Firebase**
    listenForGroupMembers(); 

    showAppContent(); // Switch the view AFTER starting listener setup
    updateGroupUI(); // Update UI (will initially show 0 members until Firebase loads)

    showToast(`Joined Group: ${currentGroupId}`, 'success');
    // Vote listeners will be attached later in displayRestaurants
}

// --- Global variable for the member listener ---
let memberListenerRef = null; 
let memberListenerCallback = null;

function listenForGroupMembers() {
    if (!database || !currentGroupId) {
        console.error("Cannot listen for members: Firebase not ready or no Group ID.");
        updateGroupUI(); // Ensure UI reflects potentially empty list
        return;
    }

    // Detach previous listener before attaching a new one
    detachMemberListener();

    const membersRef = database.ref(`groups/${currentGroupId}/members`);
    memberListenerRef = membersRef; // Store ref for detachment

    console.log(`[Member Listener] Attaching listener to: groups/${currentGroupId}/members`);

    // Use 'value' to get the whole list whenever it changes
    memberListenerCallback = membersRef.on('value', (snapshot) => {
        const membersData = snapshot.val();
        groupMembers = []; // Clear local array before repopulating
        if (membersData) {
            // Convert Firebase object (keys are IDs) into an array
            groupMembers = Object.keys(membersData).map(key => ({
                firebaseKey: key, // Store the Firebase key for potential removal
                ...membersData[key] // Spread the rest of the member data
            }));
            console.log(`[Member Listener] Received ${groupMembers.length} members from Firebase.`);
        } else {
            console.log(`[Member Listener] No members found in Firebase for group ${currentGroupId}.`);
        }
        // Update the UI with the latest member list
        updateGroupUI();
    }, (error) => {
        console.error(`[Member Listener] Firebase read error for members:`, error);
        showToast("Error fetching group members.", "error");
    });
}

// --- Add function to detach the member listener ---
function detachMemberListener() {
    if (memberListenerRef && memberListenerCallback) {
        try {
            memberListenerRef.off('value', memberListenerCallback);
            console.log("[Member Listener] Detached member listener.");
        } catch(e) {
            console.error("Error detaching member listener:", e);
        }
        memberListenerRef = null;
        memberListenerCallback = null;
    }
}

function leaveGroup() {
    console.log("Leaving group:", currentGroupId);
    // Detach ALL Firebase listeners (votes and members) FIRST
    detachFirebaseListeners();
    detachMemberListener();

    // Clear local storage for this group's members
    if (currentGroupId) {
        localStorage.removeItem(`feastfit_group_${currentGroupId}`);
    }
    localStorage.removeItem('feastfit_currentGroupId'); // Remove active group marker

    // Reset state
    currentGroupId = null;
    groupMembers = [];
    currentRestaurantOptions = [];
    resetResultsArea();
    // Listeners already detached

    // Show landing page
    showLandingPage();
    showToast("You have left the group.", "success");
}

function resetResultsArea() {
     if(resultsContent) resultsContent.style.display = 'none';
     if(emptyResultsState) emptyResultsState.style.display = 'block';
     if(loadingText) loadingText.style.display = 'none';
     if(restaurantList) restaurantList.innerHTML = '';
     if(randomPickButton) randomPickButton.style.display = 'none'; // Use correct ID
     if(randomResultDisplay) randomResultDisplay.textContent = ''; // Use correct ID
    //  if(plotImage) plotImage.src = '';
     if(aiMessageDisplay) aiMessageDisplay.textContent = '';
}

// ==================== LOCATION ====================
function initializeLocationButton() {
    if (!getLocationBtn) { console.error("Get Location button not found!"); return; }
    getLocationBtn.addEventListener('click', () => {
        if (!locationStatus) { console.error("Location status element not found!"); return; }
        locationStatus.textContent = 'Getting location...'; locationStatus.style.color = 'inherit'; getLocationBtn.disabled = true;
        getUserLocation((error, location) => {
            if (error) {
                locationStatus.textContent = `Error: ${error}`; locationStatus.style.color = 'red';
                setHiddenLocationInputs(null, null); userLatitude = null; userLongitude = null;
            } else {
                userLatitude = location.latitude; userLongitude = location.longitude;
                setHiddenLocationInputs(userLatitude, userLongitude);
                locationStatus.textContent = `Location Captured: ${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`;
                locationStatus.style.color = 'green';
            }
            getLocationBtn.disabled = false;
        });
    });
}
function setHiddenLocationInputs(lat, lon) {
     const latInput = document.getElementById('latitude'); const lonInput = document.getElementById('longitude');
     if (latInput) latInput.value = lat ?? ''; if (lonInput) lonInput.value = lon ?? '';
}
function getUserLocation(callback) {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition( pos => callback(null, { latitude: pos.coords.latitude, longitude: pos.coords.longitude }), err => { let msg = "Loc Err: "; switch(err.code){ case 1: msg+="Denied."; break; case 2: msg+="Unavailable."; break; case 3: msg+="Timeout."; break; default: msg+="Unknown."; } callback(msg, null); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  } else { callback("Geolocation not supported.", null); }
}

// ==================== SLIDER FUNCTIONALITY ====================
function initializeSliders() {
    const sliders = document.querySelectorAll('.slider');
    sliders.forEach(slider => {
        const valueDisplay = document.getElementById(`${slider.id}Value`);
        if (valueDisplay) {
            valueDisplay.textContent = slider.value;
            slider.addEventListener('input', (e) => valueDisplay.textContent = e.target.value);
        } else { console.warn(`Value display span not found for slider: ${slider.id}Value`); }
    });
}

// ==================== FORM HANDLING ====================
function initializeForm() {
    if (!preferencesForm) {
        console.error("Preferences form not found!");
        return;
    }
    preferencesForm.addEventListener('submit', (e) => {
        e.preventDefault(); // Prevent default page reload
        handleFormSubmit();
    });
}

function handleFormSubmit() {
    // --- Validation Checks ---
    // 1. Check if a group is active
    if (!currentGroupId) {
        showToast("Please create or join a group before submitting preferences.", "error");
        // Optionally scroll to landing page elements or show landing page
        // showLandingPage();
        return;
    }

    // 2. Check if location was obtained (using the hidden input values now)
    const currentLatValue = document.getElementById('latitude')?.value; // Use optional chaining
    const currentLonValue = document.getElementById('longitude')?.value;
    if (!currentLatValue || !currentLonValue) {
        showToast("Please click 'Use Current Location' to capture your location before submitting.", "warning");
        if (getLocationBtn) {
            getLocationBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            getLocationBtn.focus();
        }
        return; // Stop submission
    }
    const currentLat = parseFloat(currentLatValue);
    const currentLon = parseFloat(currentLonValue);
    // Double-check if parsing resulted in valid numbers
    if (isNaN(currentLat) || isNaN(currentLon)) {
         showToast("Invalid location data captured. Please try getting location again.", "error");
         return;
    }


    // --- Gather Form Data ---
    const formData = new FormData(preferencesForm);
    const memberName = formData.get('userName') || `User_${Date.now()}`; // Use timestamp for fallback name

    // Collect Cuisine Cravings from sliders
    const cuisineCravings = {};
    document.querySelectorAll('.slider').forEach(slider => {
        if (slider.name && slider.name.endsWith('_craving')) {
            cuisineCravings[slider.name] = parseInt(slider.value);
        }
    });

    // Structure data object for Firebase (matches backend expectation, no local 'id')
    const preferences = {
        name: memberName,
        latitude: currentLat,
        longitude: currentLon,
        hunger_level: parseInt(formData.get('hunger_level') || '3'), // Default to medium
        spice_level: parseInt(formData.get('spice_level') || '3'), // Default to medium
        ...cuisineCravings, // Add all craving key-value pairs
        diet: formData.get('diet'), // 'Veg' or 'Non-Veg'
        drink_preferences: {
            // Get value from select elements, provide null if empty string or not selected
            mocktail: formData.get('mocktail') === "" ? null : formData.get('mocktail'),
            juice: formData.get('juice') === "" ? null : formData.get('juice'),
            cocktail: formData.get('cocktail') === "" ? null : formData.get('cocktail'),
            alcohol: formData.get('alcohol') === "" ? null : formData.get('alcohol')
        }
        // 'notes' are excluded as per previous logic, add back if needed:
        // notes: formData.get('notes')
    };

    console.log("Submitting member preferences to Firebase:", preferences);

    // --- Push data to Firebase ---
    if (database && currentGroupId) {
        const membersRef = database.ref(`groups/${currentGroupId}/members`);
        // Disable submit button temporarily
        const submitButton = preferencesForm.querySelector('button[type="submit"]');
        if(submitButton) submitButton.disabled = true;

        membersRef.push(preferences) // push() auto-generates a unique key in Firebase
            .then(() => {
                showToast(`${preferences.name} added to the group! 🎉`, 'success');
                // Form reset happens *after* successful push
                resetPreferenceForm();
            })
            .catch((error) => {
                console.error("Firebase push error:", error);
                showToast("Error adding member. Please try again.", "error");
            })
            .finally(() => {
                 // Re-enable submit button regardless of success/failure
                 if(submitButton) submitButton.disabled = false;
            });
    } else {
        alert("Cannot add member - Connection issue or no Group ID active.");
        console.error("Firebase database or currentGroupId is missing.");
        return; // Stop if database isn't ready
    }

    // IMPORTANT: Do NOT manually update groupMembers array or call saveGroupToStorage here.
    // The Firebase listener ('listenForGroupMembers') is now responsible for updating
    // the local groupMembers array and triggering UI updates via updateGroupUI().
}

// --- Helper Function to Reset Form ---
function resetPreferenceForm() {
    if (preferencesForm) {
        preferencesForm.reset(); // Resets all form fields to default HTML values
    }
    // Manually reset slider visual displays back to default (e.g., 3)
    document.querySelectorAll('.slider').forEach(slider => {
         slider.value = 3; // Reset slider position to middle value
         const valueDisplay = document.getElementById(`${slider.id}Value`);
         if (valueDisplay) valueDisplay.textContent = '3'; // Reset display span
    });
    // Reset location status text and color
    if (locationStatus) {
         locationStatus.textContent = 'Click to get location (required for analysis)';
         locationStatus.style.color = 'inherit'; // Reset color
    }
    // Clear hidden location inputs
    setHiddenLocationInputs(null, null);
    // Clear stored latitude/longitude for the next submission
    userLatitude = null;
    userLongitude = null;

    console.log("Preference form reset.");
}

// ==================== GROUP MANAGEMENT ====================
function updateGroupUI() { updateMembersList(); }
function updateMembersList() {
     if (!memberCountBadge || !membersList) return; memberCountBadge.textContent = groupMembers.length; if (groupCount) groupCount.textContent = groupMembers.length;
     if (groupMembers.length === 0) { membersList.innerHTML = `<div class="empty-state">...</div>`; return; }
     membersList.innerHTML = groupMembers.map(member => {
          const name = member.name || 'Unnamed'; const h = member.hunger_level ?? 'N/A'; const s = member.spice_level ?? 'N/A'; const d = member.diet ?? 'N/A';
          const loc = member.latitude ? `<span class="member-tag">📍</span>` : '<span class="member-tag" style="color: red;">📍?</span>';
          return `<div class="member-card" data-member-id="${member.id}"><div class="member-info"><h4>${name}</h4><div class="member-tags"><span class="member-tag">🍽️ H:${h}</span><span class="member-tag">🌶️ S:${s}</span><span class="member-tag">Diet: ${d}</span>${loc}</div></div><div class="member-actions"><button onclick="removeMember(${member.id})" title="Remove ${name}"><i class="fas fa-trash"></i></button></div></div>`;
     }).join('');
}
function removeMember(memberId) {
    if (!database || !currentGroupId || !memberFirebaseKey) {
        console.error("Cannot remove member - missing info.");
        return;
    }
    console.log(`Attempting to remove member with key: ${memberFirebaseKey}`);

    const memberRef = database.ref(`groups/${currentGroupId}/members/${memberFirebaseKey}`);
    memberRef.remove()
        .then(() => {
            showToast('Member removed');
            // No need to manually filter local array or update UI - listener handles it
        })
        .catch((error) => {
            console.error("Firebase remove error:", error);
            showToast("Error removing member.", "error");
        });
}

function clearGroup() {
     if (!database || !currentGroupId) return; // Need group ID
     // Check if there are members locally first (optional)
     // if (groupMembers.length === 0) return;

     if (confirm('Are you sure you want to clear ALL members and votes for this group?')) {
         const groupMembersRef = database.ref(`groups/${currentGroupId}/members`);
         const groupVotesRef = database.ref(`groups/${currentGroupId}/votes`);

         // Remove members from Firebase
         groupMembersRef.remove()
             .then(() => {
                 console.log("Cleared members from Firebase.");
                 // Also remove votes
                 return groupVotesRef.remove();
             })
             .then(() => {
                  console.log("Cleared votes from Firebase.");
                  // Clear local state AFTER successful Firebase removal
                  groupMembers = [];
                  saveGroupToStorage(); // Clear local storage for this group
                  updateGroupUI();
                  resetResultsArea();
                  detachFirebaseListeners(); // Clear vote listeners
                  showToast('Group cleared');
             })
             .catch((error) => {
                  console.error("Error clearing group data from Firebase:", error);
                  showToast("Error clearing group.", "error");
             });
     }
}

// ==================== BACKEND INTEGRATION ====================
async function generateRecommendations() {
    if (!currentGroupId) { showToast("Join/Create group first.", "error"); return; }
    if (groupMembers.length === 0) { showToast('Add members first.', 'warning'); return; }
    const missingLoc = groupMembers.some(m => !m.latitude || !m.longitude);
    if (missingLoc) { showToast('Ensure all members captured location.', 'warning'); return; }

    console.log("generateRecommendations for group:", currentGroupId);
    if (loadingText) loadingText.style.display = 'block';
    if (resultsContent) resultsContent.style.display = 'none';
    if (emptyResultsState) emptyResultsState.style.display = 'none';
    if (generateButton) generateButton.disabled = true;
    resetHighlights(); if (randomResultDisplay) randomResultDisplay.textContent = '';

    try {
        const dataToSend = groupMembers.map(({ firebaseKey, ...rest }) => rest); // <<< ENSURE THIS LINE IS CORRECT        
        console.log("Data being sent to backend (firebaseKey removed):", dataToSend);
        const backendUrl = 'https://hungryhive-549j.onrender.com/analyze';
        const response = await fetch('https://hungryhive-549j.onrender.com/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSend) });
        if (!response.ok) { let err = `Backend Error ${response.status}`; try { const d = await response.json(); err += ` - ${d.error || response.statusText}`;} catch(e){} throw new Error(err); }
        const results = await response.json();
        console.log("Backend results:", results);
        displayResults(results); // Display everything
    } catch (error) {
         console.error("Backend call error:", error);
         if (loadingText) loadingText.textContent = `Error: ${error.message}`;
         if (loadingText) loadingText.style.display = 'block';
         if (resultsContent) resultsContent.style.display = 'none';
         if (emptyResultsState) { emptyResultsState.style.display = 'block'; emptyResultsState.innerHTML = `<i class="fas fa-exclamation-triangle"></i><p>Error. Check console.</p>` }
    } finally {
        if (generateButton) generateButton.disabled = false;
        if (loadingText && !loadingText.textContent.startsWith("Error:")) { loadingText.style.display = 'none'; }
    }
}

// ==================== DISPLAY RESULTS =====================
function displayResults(results) {
     if (!results || !resultsContent) { console.error("Invalid results data."); return; }
     if (aiMessageDisplay) aiMessageDisplay.textContent = results.aiRecommendation?.friendlyMessage || "AI msg unavailable.";
    //  if (plotImage) { plotImage.src = `data:image/png;base64,${results.plotBase64 || ''}`; plotImage.style.display = results.plotBase64 ? 'block' : 'none'; }
     // Display restaurant options for voting
     displayRestaurants(results.topRestaurants);
     resultsContent.style.display = 'block';
     if (emptyResultsState) emptyResultsState.style.display = 'none';
     if (loadingText) loadingText.style.display = 'none';
     scrollToSection('recommendations');
}



// ==================== VOTING & RANDOM SELECTION ====================
function displayRestaurants(options) {
    // Ensure the restaurant list element exists
    if (!restaurantList) {
        console.error("Restaurant list element (#restaurant-list) not found!");
        return;
    }
    restaurantList.innerHTML = ''; // Clear previous list items
    detachFirebaseListeners(); // Clean up old Firebase listeners

    // Prepare options, ensure it's an array, and generate voteKey
    currentRestaurantOptions = (options || []).map((opt, index) => {
        let key = `option-${index}`; // Fallback key
        if (opt.name) {
             // Basic sanitization: remove non-alphanumeric, replace spaces with underscores
             key = opt.name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
             // Add coordinates if available, replacing '.' with '_' for Firebase path validity
             const lat = opt.gps_coordinates?.latitude;
             const lon = opt.gps_coordinates?.longitude;
             if (lat != null && lon != null) { // Check for null or undefined
                  const latStr = String(lat).replace('.', '_');
                  const lonStr = String(lon).replace('.', '_');
                  key += `_${latStr}_${lonStr}`; // Append sanitized coordinates
             }
             // Ensure key is not excessively long (Firebase path length limits)
             key = key.substring(0, 100); // Limit key length
        }
        opt.voteKey = key; // Add the VALID key to the option object
        // console.log("Generated voteKey:", key, "for", opt.name); // DEBUG
        return opt;
    });

    // Handle case where no restaurants are found/provided
    if (currentRestaurantOptions.length === 0) {
        restaurantList.innerHTML = '<li>No specific restaurant options found.</li>';
        if (randomPickButton) randomPickButton.style.display = 'none'; // Hide random pick button
        return;
    }

    // Loop through each restaurant option and create its list item
    currentRestaurantOptions.forEach(option => {
        const voteKey = option.voteKey; // Use the generated VALID key
        const li = document.createElement('li');
        li.dataset.voteKey = voteKey; // Store the key on the element

        // --- Create Restaurant Info Div ---
        const infoDiv = document.createElement('div');
        infoDiv.className = 'restaurant-info';

        // Safely get data, provide defaults
        const name = option.name || 'Unknown Name';
        const address = option.address || 'Address not available';
        const rating = option.rating === null || option.rating === undefined ? 'N/A' : option.rating; // Handle null/undefined rating
        const mapsLink = option.link; // Get the direct link from SerpAPI result

        // Create hyperlink for the name IF a link exists
        let nameHtml = `<strong>${name}</strong>`; // Default to just bold name
        if (mapsLink) {
            // If a link exists, wrap the name in an <a> tag
            nameHtml = `<a href="${mapsLink}" target="_blank" title="View ${name} on Google Maps"><strong>${name}</strong></a>`;
        }

        // Set the innerHTML for the info section
        infoDiv.innerHTML = `${nameHtml}<br>
                             <small>${address}</small><br>
                             <small>Rating: ${rating}</small>`;

        // --- Create Voting Div ---
        const voteDiv = document.createElement('div');
        voteDiv.className = 'vote-section';

        const voteCountSpan = document.createElement('span');
        voteCountSpan.className = 'vote-count';
        voteCountSpan.id = `votes-${voteKey}`; // Use VALID key for ID
        voteCountSpan.textContent = 'Votes: 0'; // Initial display

        const voteBtn = document.createElement('button');
        voteBtn.className = 'vote-button';
        voteBtn.textContent = 'Vote 👍';
        voteBtn.onclick = () => handleVote(voteKey); // Call handleVote with VALID key

        voteDiv.appendChild(voteCountSpan);
        voteDiv.appendChild(voteBtn);

        // --- Append elements to list item ---
        li.appendChild(infoDiv);
        li.appendChild(voteDiv);
        restaurantList.appendChild(li); // Add the item to the main list

        // --- Attach Firebase Listener ---
        // Check if Firebase is initialized and a group ID is active
        if (database && currentGroupId) {
            const voteRef = database.ref(`groups/${currentGroupId}/votes/${voteKey}/count`); // Use VALID key in path
            const listener = voteRef.on('value', snapshot => {
                const count = snapshot.val() || 0;
                const countSpan = document.getElementById(`votes-${voteKey}`); // Use VALID key to find span
                if (countSpan) countSpan.textContent = `Votes: ${count}`;
            }, error => console.error("Firebase read error for key", voteKey, error));
            // Store listener details for later cleanup
            firebaseListeners.push({ ref: voteRef, listener: listener });
        } else {
             // Disable voting if Firebase isn't ready
             console.warn("Firebase not initialized or no group ID, cannot set up vote listeners.");
             voteBtn.disabled = true;
             voteBtn.textContent = "Voting N/A";
             voteBtn.style.backgroundColor = "#ccc";
        }
    });

    // Show the random pick button now that options are displayed
    if (randomPickButton) randomPickButton.style.display = 'block';
    // Ensure the result display is cleared initially
    if (randomResultDisplay) randomResultDisplay.textContent = '';
}


function detachFirebaseListeners() {
     if (!database) return;
     firebaseListeners.forEach(({ ref, listener }) => { try { ref.off('value', listener); } catch (e) {console.error("Detach err:", e)} });
     firebaseListeners = []; console.log("Detached FB listeners.");
}

function handleVote(voteKey) {
     if (!database || !currentGroupId) { alert("Cannot vote - not connected."); return; }
     const voteRef = database.ref(`groups/${currentGroupId}/votes/${voteKey}/count`);
     voteRef.transaction(c => (c || 0) + 1, (err, comm, snap) => { /* ... logging ... */ });
}

// ** Random Pick Logic **
function startRandomPick() {
    if (isPickingRandomly) return;
    if (!currentRestaurantOptions || currentRestaurantOptions.length === 0) { alert("No restaurants to choose from!"); return; }
    console.log("Starting random selection...");
    if (randomResultDisplay) randomResultDisplay.textContent = 'Picking randomly...';
    if (randomPickButton) randomPickButton.disabled = true;
    isPickingRandomly = true;
    setTimeout(() => {
        const randomIndex = Math.floor(Math.random() * currentRestaurantOptions.length);
        const winningOption = currentRestaurantOptions[randomIndex];
        displayRandomChoice(winningOption);
    }, 1500); // 1.5 second delay
}

function displayRandomChoice(winningOption) {
    console.log("Random selection finished. Winner:", winningOption);
    const winnerName = winningOption ? winningOption.name : "No winner selected";
    if (randomResultDisplay) randomResultDisplay.textContent = `🎉 Random Pick: ${winnerName}! 🎉`;
    isPickingRandomly = false;
    if (randomPickButton) randomPickButton.disabled = false;
    if (winningOption && winningOption.voteKey) highlightWinner(winningOption.voteKey);
}

function highlightWinner(winningVoteKey) {
    if (!restaurantList) return;
    const listItems = restaurantList.getElementsByTagName('li');
    for (let item of listItems) {
         item.style.backgroundColor = item.dataset.voteKey === winningVoteKey ? '#fff3cd' : '#fff';
         item.style.borderColor = item.dataset.voteKey === winningVoteKey ? '#ffeeba' : '#e0e0e0';
    }
}

function resetHighlights() {
    if (!restaurantList) return;
    const listItems = restaurantList.getElementsByTagName('li');
    for (let item of listItems) {
         item.style.backgroundColor = '#fff';
         item.style.borderColor = '#e0e0e0';
    }
}

// ==================== NAVIGATION & STORAGE ====================
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link, .mobile-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); const targetId = link.getAttribute('href');
            if (targetId?.startsWith('#')) scrollToSection(targetId.substring(1));
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            if (link.classList.contains('nav-link')) link.classList.add('active');
            if (mobileMenu) mobileMenu.classList.remove('active');
        });
    });
    // Intersection Observer
    const sections = document.querySelectorAll('section[id]');
    if ('IntersectionObserver' in window && sections.length > 0) {
        const obsOpts = { root: null, rootMargin: '-40% 0px', threshold: 0 };
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => { if (entry.isIntersecting) { const id = entry.target.id; document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${id}`)); } });
        }, obsOpts);
        sections.forEach(section => observer.observe(section));
    }
}
function scrollToSection(sectionId) { const section = document.getElementById(sectionId); if(section) section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
function initializeMobileMenu() {
     if(mobileMenuBtn && mobileMenu) { mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.toggle('active')); document.addEventListener('click', (e) => { if (!mobileMenu.contains(e.target) && !mobileMenuBtn.contains(e.target)) mobileMenu.classList.remove('active'); }); }
}
async function saveGroupToStorage() {
  if (!database || !currentGroupId) return;
  try {
    await database.ref(`groups/${currentGroupId}/members`).set(groupMembers);
    console.log("✅ Group members saved to Firebase:", groupMembers);
  } catch (error) {
    console.error("Error saving group to Firebase:", error);
  }
}

function loadGroupFromStorage() {
  if (!database || !currentGroupId) return;

  const membersRef = database.ref(`groups/${currentGroupId}/members`);
  
  // Remove any previous listener for safety
  detachFirebaseListeners();
  const listener = membersRef.on('value', snapshot => {
    const data = snapshot.val();
    groupMembers = data ? Object.values(data) : [];
    console.log("👥 Synced members from Firebase:", groupMembers);
    updateGroupUI();
  }, error => console.error("Firebase read error:", error));

  firebaseListeners.push({ ref: membersRef, listener: listener });
}

// ==================== TOAST NOTIFICATIONS ====================
function showToast(message, type = 'success') {
     const toast = document.getElementById('toast'); const toastMessage = document.getElementById('toastMessage'); if(!toast || !toastMessage) return;
     toastMessage.textContent = message; const icon = toast.querySelector('i');
     if (type==='success') { icon.className='fas fa-check-circle'; toast.style.backgroundColor='var(--success)'; }
     else if (type==='warning') { icon.className='fas fa-exclamation-triangle'; toast.style.backgroundColor='var(--warning)'; }
     else if (type==='error'||type==='danger') { icon.className='fas fa-times-circle'; toast.style.backgroundColor='var(--danger)'; }
     else { icon.className='fas fa-info-circle'; toast.style.backgroundColor='var(--primary)'; }
     toast.classList.add('show'); setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// --- Run Initialization ---
initializeApp(); // Start the app
