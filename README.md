# Card Game Project

## Overview
This project is a card game application designed for smartphones, where players compete by playing cards in turns. Each player starts with 4 cards and must play a higher card from their hand or draw from the deck if they cannot play.

## Project Structure
```
card-game-app
├── public
│   ├── css
│   │   └── style.css
│   ├── js
│   │   └── game.js
│   └── index.html
├── src
│   ├── db
│   │   └── database.sql
│   ├── includes
│   │   ├── db_connect.php
│   │   └── functions.php
│   ├── api
│   │   ├── game.php
│   │   └── player.php
│   └── config.php
├── .gitignore
├── README.md
└── composer.json
```

## Setup Instructions
1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd card-game-app
   ```

2. **Install dependencies**:
   Make sure you have Composer installed, then run:
   ```bash
   composer install
   ```

3. **Set up the database**:
   - Import the `database.sql` file into your MySQL database to create the necessary tables.
   - Update the database connection settings in `src/config.php`.

4. **Run the application**:
   - Use a local server environment like XAMPP or MAMP to serve the application.
   - Access the game through your web browser at `http://localhost/card-game-app/public/index.html`.

## Game Rules
- Each player starts with 4 cards.
- Players take turns playing one card at a time.
- If a player cannot play a higher card, they must draw from the remaining deck.
- The game continues until one player runs out of cards or a predetermined winning condition is met.

## Contributing
Contributions are welcome! Please fork the repository and submit a pull request with your changes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.