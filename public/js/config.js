window.CORE_CONFIG = {
  serverName: "Core SMP",
  serverIP:   "core.lagless.games",
  serverPort: "",                                
  discord:    "https://discord.gg/XGQ5DHdSfA",    
  currency:   "GBP",                              
  accent:     "#e0002a",                          
  slides: [                                          
    { image: "images/core.png", title: "Core SMP Shop",  text: "Support the server and unlock ranks and tokens." },
    { image: "images/core.png", title: "Ranks & Tokens", text: "Stand out in chat and spend tokens in-game." }
  ],
  compare: { cols: ["Rank +", "Rank ++", "Rank +++"], rows: [] },
  perksNote: "You keep the rank forever, every season.", 
  items: {
    "Rank +": { image: "images/rank-1.png", big: "+", label: "RANK", perks: ["You keep the rank forever, every season", "5 home slots", "Lower /string cooldown (25s)", "6 row enderchest", "/ec", 'Discord role (<a href="https://discord.gg/XGQ5DHdSfA" target="_blank" rel="noopener noreferrer">make a ticket to claim</a>)', "Tab priority", "Tab colour", "Nametag prefix" ] },
    "Rank ++": { image: "images/rank-2.png", big: "++", label: "RANK", perks: ["You keep the rank forever, every season", "/feed", "40% villager discount", "15 home slots", "Lower /string cooldown (15s)", "2 page 6 row enderchest", "/ec", "Tab priority", "Tab colour", "Tab prefix", "Nametag prefix", 'Discord role (<a href="https://discord.gg/XGQ5DHdSfA" target="_blank" rel="noopener noreferrer">make a ticket to claim</a>)' ] },
    "Rank +++": { image: "images/rank-3.png", big: "+++", label: "RANK", perks: ["You keep the rank forever, every season", "/feed", "60% villager discount", "No /string cooldown", "/anvil, /craftingtable, /smithingtable, /grindstone", "4 page 6 row enderchest", "/ec", "45 home slots", 'Discord role (<a href="https://discord.gg/XGQ5DHdSfA" target="_blank" rel="noopener noreferrer">make a ticket to claim</a>)', "Tab priority", "Tab prefix", "Tab colour", "Nametag prefix", "Nametag colour" ] },
    "400 TOKENS": { image: "images/tokens-1.png" },
    "2500 TOKENS": { image: "images/tokens-2.png" },
    "5000 + 500 FREE TOKENS": { image: "images/tokens-3.png", bonus: "+500 BONUS" },
    "10000 + 2000 FREE TOKENS": { image: "images/tokens-3.png", bonus: "+2,000 BONUS", popular: true },
    "25000 + 7000 FREE TOKENS": { image: "images/tokens-5.png", bonus: "+7,000 BONUS" },
    "50000 + 20000 FREE TOKENS": { image: "images/tokens-6.png", bonus: "+20,000 BONUS" },
    "Crown tag":  { image: "images/Crowntag.png" },
    "Heart tag":  { image: "images/hearttag.png" },
    "Meteor tag": { image: "images/Meteortag.png" },
    "Money tag":  { image: "images/moneytag.png" },
    "Sad face tag": { image: "images/sadface.png" },
    "Star tag":   { image: "images/startag.png" },
    "Sword tag":  { image: "images/swordtag.png" },
    "Custom tag": { big: "Custom", label: "TAG" }
  },
  priceMode: "price",
  forceCurrency: false,
  showBadges: true,
  recentUrl: "",
  demo: true
};