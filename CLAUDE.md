# Working on CoffeeKo: GitHub etiquette (owner's standing rule)

The owner's GitHub account was suspended once (Nov 2026) after a burst of automated activity
on a new account. Follow these rules by default for every change:

1. **Preview locally, not on GitHub.** Build and test changes in the workspace, then show the
   owner phone- and desktop-size screenshots. No branch, pull request or push while iterating.
2. **One upload per approved round.** After the owner approves, push everything as a single
   commit to `main` (Netlify publishes it). Never a stream of small commits.
3. **No polling GitHub.** Don't loop on commit statuses or check runs. To confirm a deploy,
   check Netlify or load coffeeko.in a couple of times.
4. **No test branches, no deleting branches, no extra pull requests.** A live preview link
   (one PR / deploy preview) only when the owner asks for it, at most once per round.
5. **Keep volume low:** a handful of pushes per day at most, and as few GitHub API calls as possible.
6. **Never touch GitHub while the owner has said not to** (for example while the account is under review).
