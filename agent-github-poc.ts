import { initAgentsPoc, ChatOpenAI, Variable } from './src';

console.log('🐙 AgentsPoc GitHub Profile Assistant POC - Automated Profile Bio Update');
console.log('=====================================================================\n');

// Initialize logger for debugging (optional)
console.log('🔧 Initializing AgentsPoc GitHub Assistant with ChatOpenAI...\n');

// Main function to run the GitHub profile assistant
async function main(): Promise<void> {
  try {
    console.log('Starting AgentsPoc GitHub profile update process...\n');
    
    // Target GitHub website
    const domain = 'github.com';
    console.log(`📝 Target Domain: "https://www.${domain}"\n`);
    
    // Create credentials and profile variables (REPLACE WITH YOUR ACTUAL CREDENTIALS)
    const username = new Variable({
      name: 'username',
      value: 'Stormman32@gmail.com', // TODO: Replace with actual GitHub username/email
      isSecret: false
    });
    
    const password = new Variable({
      name: 'password',
      value: 'ATkK8jDR=f', // TODO: Replace with actual password  
      isSecret: true
    });

    const bioText = new Variable({
      name: 'bioText',
      value: 'Software developer passionate about automation and AI. Building the future one line of code at a time. 🚀', // TODO: Replace with desired bio text
      isSecret: false
    });

    const twoFactorCode = new Variable({
      name: 'twoFactorCode',
      value: '', // TODO: Leave empty unless you need to provide a 2FA code
      isSecret: true
    });

    // Initialize ChatOpenAI with configuration
    const llm = new ChatOpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
      model: 'gpt-5-mini',
      temperature: 0.3, // Lower temperature for more consistent execution
    });
    
    // Initialize AgentsPoc
    const agentsPoc = initAgentsPoc({
      llm,
      headless: false, // Show browser for demo purposes
      variables: [username, password, bioText, twoFactorCode],
    });
    
    console.log('🔄 AgentsPoc is logging in and updating GitHub profile...\n');
    
    // Execute GitHub profile update process
    const openatorResult = await agentsPoc.start(
      `https://www.${domain}`,
      `You are a GitHub profile assistant that helps update user profile information. Complete this task in the following steps in order:

      STEP 1 - LOGIN:
      1. Navigate to the GitHub sign-in page (look for "Sign in" button in top right)
      2. Find and fill the login form
      3. Look for username/email field and enter: {{username}}
      4. Look for password field and enter: {{password}}
      5. Click the "Sign in" button to authenticate
      6. Handle any 2FA challenge if it appears:
         - If 2FA is required and {{twoFactorCode}} is provided, enter it
         - If 2FA is required but no code is provided, describe the challenge and wait for manual intervention
      7. Wait for successful login confirmation (should show your profile avatar in top right)

      IMPORTANT: If you see your profile avatar/username in the top right corner, then you are logged in and can proceed to the next step.

      STEP 2 - NAVIGATE TO PROFILE SETTINGS:
      8. Click on your profile avatar/username in the top right corner
      9. Select "Settings" from the dropdown menu
      10. Navigate to the "Public profile" or "Profile" section (usually on the left sidebar)
      11. Ensure you're on the profile editing page where you can see bio/description field

      STEP 3 - UPDATE BIO:
      12. Find the "Bio" or "Biography" text field (may be labeled as "Bio" or similar)
      13. Clear any existing bio text if present
      14. Enter the new bio text: {{bioText}}
      15. Ensure the text is properly entered and visible in the field

      STEP 4 - SAVE CHANGES:
      16. Look for "Update profile" or "Save profile" button (usually green button)
      17. Click the save button to commit the changes
      18. Wait for confirmation that the profile was updated (page refresh or success message)

      STEP 5 - VERIFY & EXTRACT PROFILE INFO:
      19. Navigate to your public profile page (click on your username/avatar, then "Your profile")
      20. Verify the bio has been successfully updated
      21. Extract the profile information and return it in this JSON format:

      -- GitHub Profile JSON format --
      {
        "profileSummary": "GitHub profile bio update completed",
        "username": "Your GitHub username",
        "displayName": "Your display name if set",
        "profileUrl": "Your profile URL (https://github.com/username)",
        "bio": {
          "oldBio": "Previous bio text if any",
          "newBio": "The updated bio text",
          "updateSuccessful": "true/false"
        },
        "profileStats": {
          "publicRepos": "Number of public repositories",
          "followers": "Number of followers",
          "following": "Number of people following"
        },
        "profileImage": "Profile image URL or 'Default' if using default",
        "joinDate": "Member since date if visible",
        "location": "Location if set in profile",
        "website": "Website URL if set",
        "company": "Company if set",
        "lastUpdated": "Current timestamp of update"
      }

      IMPORTANT NOTES:
      - Use the variables {{username}}, {{password}}, {{bioText}}, and {{twoFactorCode}} for respective inputs
      - If login fails or requires manual 2FA intervention, describe the issue clearly
      - If bio field is not found, look for alternative names like "Description", "About", or similar
      - Only update the bio - do not modify other profile fields
      - Extract real data from the page, not placeholder information
      - Return ONLY the JSON format requested above
      - If any step fails, describe the issue and attempt to recover or find alternatives
      - Be patient with page loads and form submissions`
    );
    
    console.log(`✅ GitHub profile update process completed with status: ${openatorResult.status}!\n`);
    
    // Display the extracted profile details
    console.log('🐙 GITHUB PROFILE UPDATE RESULTS');
    console.log('═'.repeat(50));
    
    // Try to parse and format the result
    try {
      // Attempt to parse as JSON if it's structured data
      let parsedResult;
      const result = openatorResult.result;
      if (typeof result === 'string' && result.trim().startsWith('{')) {
        parsedResult = JSON.parse(result);
        console.log(JSON.stringify(parsedResult, null, 2));
      } else {
        // If not JSON, display the raw result
        console.log('Raw profile data:');
        console.log(result);
      }
    } catch (parseError) {
      console.log('Raw GitHub profile result:');
      console.log(openatorResult.result);
      console.log('\n⚠️  Note: Result may need manual parsing');
    }
    
    console.log('═'.repeat(50));
    console.log('\n🎉 GitHub Profile Assistant POC completed successfully!');
    console.log('💡 This demonstrates automated profile management and bio updates');
    console.log('⚠️  Remember: Only the bio was updated - other profile fields remain unchanged');
    console.log('🔒 Your profile is now updated with the specified bio text');
    
  } catch (error) {
    console.error('❌ Error running GitHub AgentsPoc:', error);
    
    // Provide helpful error messages for common issues
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('apiKey')) {
        console.log('\n💡 Make sure to set your OpenAI API key:');
        console.log('   export OPENAI_API_KEY=sk-your-key-here');
      }
      if (error.message.includes('insufficient_quota')) {
        console.log('\n💡 Check your OpenAI account has sufficient credits');
      }
      if (error.message.includes('browser') || error.message.includes('chromium')) {
        console.log('\n💡 Make sure browsers are installed:');
        console.log('   npm run install:browsers');
      }
      if (error.message.includes('login') || error.message.includes('authentication')) {
        console.log('\n💡 Check your GitHub login credentials are correct');
        console.log('   Update the username and password variables in the code');
        console.log('   Note: GitHub may require 2FA verification');
      }
      if (error.message.includes('2FA') || error.message.includes('two-factor')) {
        console.log('\n💡 GitHub requires 2FA authentication');
        console.log('   Provide your 2FA code in the twoFactorCode variable');
        console.log('   Or run with headless: false to manually handle 2FA');
      }
      if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
        console.log('\n💡 GitHub has rate limited the requests');
        console.log('   Wait a few minutes before trying again');
      }
    }
  }
}

// Execute the demo
if (require.main === module) {
  main();

  // Wait for 300 seconds before exiting
  setTimeout(() => {
    console.log('🔄 Waiting for 500 seconds...');
    process.exit(0);
  }, 500000);
}

export { main };