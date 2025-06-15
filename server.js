const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'burrinho'
});

let rooms = {}; // { roomId: [socketId1, socketId2] }
let games = {}; // { roomId: { deck, hands, table, turn } }
let disconnectTimers = {};
const express = require('express');
const app = express();
app.use(express.json());

const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server);

/* // Cadastro
app.post('/register', async (req, res) => {
    const { phone, password, firtsname, lastname } = req.body;
    try {
        await db.execute('INSERT INTO users (phone, password, firtsname, lastname) VALUES (?, ?, ?, ?)', [phone, password, firtsname, lastname]);
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Telefone já cadastrado.' });
    }
});
 */

// Cadastro

// ... seu setup de express, socket.io, mysql2/promise etc.




app.get('/rooms', async (req, res) => {
  try {
    // 1) busca todas as salas
    const [roomRows] = await db.execute(`SELECT id, code, nameroom, bet FROM rooms`);
    const output = [];

    for (const room of roomRows) {
      // 2) conta jogadores nessa sala
      const [[{ count: players }]] = await db.execute(
        `SELECT COUNT(*) AS count 
         FROM players_rooms 
         WHERE room_id = ?`,
        [room.id]
      );

      // 3) pega o primeiro jogador (player_number = 0) como “dono” da sala
      const [pr] = await db.execute(
        `SELECT user_id 
         FROM players_rooms 
         WHERE room_id = ? AND player_number = 0 
         LIMIT 1`,
        [room.id]
      );

      let nameplayer = '---';
      let img = '/img/default-avatar.png'; // fallback

      if (pr.length) {
        // 4) busca nome e foto do usuário
        const [usr] = await db.execute(
          `SELECT firtsname, lastname, profilephoto 
           FROM users 
           WHERE id = ?`,
          [pr[0].user_id]
        );
        if (usr.length) {
          nameplayer = `${usr[0].firtsname} ${usr[0].lastname}`;
          if (usr[0].profilephoto) {
            // transforma BLOB em base64
            img =
              'data:image/jpeg;base64,' +
              usr[0].profilephoto.toString('base64');
          }
        }
      }

      output.push({
        id: room.id,
        nameroom: room.nameroom,
        bet: room.bet,
        roomNumber: room.code,
        players,
        nameplayer,
        img
      });
    }

    res.json(output);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha ao buscar salas.' });
  }
});



app.post('/cadastro', async (req, res) => {
  const { firstname, lastname, phone, password, profilePic} = req.body;

  if (!firstname || !lastname || !phone || !password || !profilePic) {
    return res
      .status(400)
      .json({ success: false, error: 'Campos incompletos.' });
  }

  try {
    // 1) Verifica se já existe telefone
    const [exists] = await db.execute(
      'SELECT 1 FROM users WHERE phone = ? LIMIT 1',
      [phone]
    );
    if (exists.length) {
      return res
        .status(409)
        .json({ success: false, error: 'Telefone já cadastrado.' });
    }

    // 2) Insere novo usuário
    const sql = `
      INSERT INTO users
        (phone, password, firtsname, lastname, profilephoto)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.execute(sql, [phone, password, firstname, lastname, profilePic]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ success: false, error: 'Erro interno ao registrar.' });
  }
});




// Login
app.post('/login', async (req, res) => {
    const { phone, password } = req.body;
    const [rows] = await db.execute('SELECT id FROM users WHERE phone = ? AND password = ?', [phone, password]);
    if (rows.length > 0) {
        res.json({ success: true, userId: rows[0].id });
    } else {
        res.status(401).json({ error: 'Telefone ou senha inválidos.' });
    }
});




app.use(express.static('public'));

io.on('connection', (socket) => {

/* socket.on('createRoom', async ({ code, nameroom, bet}) => {
    try {
      // 1) Insere nova sala
      const [r] = await db.execute(
        
        'INSERT INTO rooms (code, nameroom, bet) VALUES (?, ?, ?)',
        [code, nameroom, bet]
      ); */
      
       /*  // 2) Insere o jogador na sala
        await db.execute(
        'INSERT INTO players_rooms (user_id, room_id, player_number, socket_id) VALUES (?, ?, ?, ?)',
        [socket.userId, r.insertId, 0, socket.id]
        ); */
      // 2) Emite de volta o ID numérico da sala
  /*     socket.emit('roomCreated', { roomDbId: r.insertId, code });
    } catch (err) {
      console.error(err);
      socket.emit('roomError', { error: 'Não foi possível criar a sala.' });
    }
  });
 */
// Função que limpa a sala em memória e no DB quando vazia

 socket.on('leaveRoom', async ({ roomId,  userId }) => {
    await handleLeave(roomId, socket.id);

   const [[playerRow]] = await db.execute(
  'SELECT id FROM players_rooms WHERE user_id = ?',
  [userId]
);
const playerRoomId = playerRow?.id;

if (playerRoomId) {
  await db.execute('DELETE FROM hands WHERE player_room_id = ?', [playerRoomId]);
}
await db.execute('DELETE FROM players_rooms WHERE room_id = ? AND user_id = ?', [roomId, userId]);
   

  io.emit('roomUpdated');
  });

  // 2) Quando o cliente desconectar inesperadamente
  socket.on('disconnect', async () => {
    // percorre todas as salas em que este socket estava
    for (const code of Object.keys(rooms)) {
      if (rooms[code].includes(socket.id)) {
        await handleLeave(code, socket.id);
        break;
      }
    }
  });


async function handleLeave(roomCode, socketId) {
  // 1) Remove o socket da sala em memória
  rooms[roomCode] = (rooms[roomCode]||[])
                    .filter(sid => sid !== socketId);

  // 2) Se sobrar um jogador, avise-o
  if (rooms[roomCode]?.length === 1) {
    io.to(rooms[roomCode][0])
      .emit('message','Seu adversário saiu da sala.');
  }

  // 3) Se a sala estiver vazia, limpa tudo no DB
  if (!rooms[roomCode] || rooms[roomCode].length === 0) {
    // 3.1) Busca o ID interno da sala
    const [[r]] = await db.execute(
      'SELECT id FROM rooms WHERE code = ?',
      [roomCode]
    );
    if (r) {
      const roomDbId = r.id;

      // 3.2) Apaga cartas dos jogadores (hands) usando JOIN com players_rooms
      await db.execute(
        `DELETE h
           FROM hands h
     INNER JOIN players_rooms pr
             ON h.player_room_id = pr.id
          WHERE pr.room_id = ?`,
        [roomDbId]
      );

      // 3.3) Apaga cartas do baralho
      await db.execute(
        'DELETE FROM decks WHERE room_id = ?',
        [roomDbId]
      );

      // 3.4) Apaga cartas na mesa
      await db.execute(
        'DELETE FROM table_cards WHERE room_id = ?',
        [roomDbId]
      );

      // 3.5) Apaga vínculos de jogadores à sala
      await db.execute(
        'DELETE FROM players_rooms WHERE room_id = ?',
        [roomDbId]
      );

      // 3.6) Por fim, apaga a própria sala
      await db.execute(
        'DELETE FROM rooms WHERE id = ?',
        [roomDbId]
      );
    }

    // 4) Limpa do objeto em memória
    delete rooms[roomCode];
    delete games[roomCode];
  }
}




    socket.on('joinRoom', async ({ roomId, userId }) => {
    // Busca ou cria a sala
    let [roomRows] = await db.execute('SELECT id FROM rooms WHERE code = ?', [roomId]);
    roomDbId = roomRows[0].id;
if (roomRows.length === 0) {
   socket.emit('roomNotFound', { error: 'Sala não encontrada.' });
    return;
}

// Verifica se o usuário já está na sala
    const [playerRows] = await db.execute(
        'SELECT id, player_number FROM players_rooms WHERE room_id = ? AND user_id = ?',
        [roomDbId, userId]
    );
    let playerNumber;
    if (playerRows.length > 0) {
        playerNumber = playerRows[0].player_number;
        await db.execute(
            'UPDATE players_rooms SET socket_id = ? WHERE id = ?',
            [socket.id, playerRows[0].id]
        );
    } else {
        let [players] = await db.execute('SELECT COUNT(*) as count FROM players_rooms WHERE room_id = ?', [roomDbId]);
        if (players[0].count >= 2) {
            socket.emit('full');
            return;
        }
        playerNumber = players[0].count;
        await db.execute(
            'INSERT INTO players_rooms (user_id, room_id, player_number, socket_id) VALUES (?, ?, ?, ?)',
            [userId, roomDbId, playerNumber, socket.id]
        );
    }

    // Atualiza estrutura em memória
    if (!rooms[roomId]) rooms[roomId] = [];
    rooms[roomId] = rooms[roomId].filter(sockId => sockId !== socket.id);
    rooms[roomId].push(socket.id);
    socket.join(roomId);

if (disconnectTimers[roomId]) {
    clearTimeout(disconnectTimers[roomId]);
    disconnectTimers[roomId] = null;
    socket.to(roomId).emit('message', 'Seu parceiro voltou! O jogo continua.');
    // Envie o estado do jogo para ambos
    if (games[roomId]) {
        rooms[roomId].forEach((sockId, i) => {
            io.to(sockId).emit('gameState', {
                hand: games[roomId].hands[i],
                opponentCardCount: games[roomId].hands[1 - i].length,
                table: games[roomId].table,
                deckCount: games[roomId].deck.length,
                turn: games[roomId].turn
            });
        });
    }
}

    socket.emit('playerNumber', playerNumber);

        // Se dois jogadores, inicia o jogo (em memória)
        if (rooms[roomId].length === 2) {
            let deck = [];
const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
for (let suit of suits) {
    for (let value = 1; value <= 13; value++) {
        deck.push({ value, suit });
    }
}
deck = deck.sort(() => Math.random() - 0.5);
let hands = [deck.splice(0, 10), deck.splice(0, 10)];
let table = [];
let turn = 0;


// Salva deck no banco
for (const card of deck) {
    await db.execute('INSERT INTO decks (room_id, card_value, card_suit) VALUES (?, ?, ?)', [roomDbId, card.value, card.suit]);
}
// Salva mãos no banco
for (let p = 0; p < 2; p++) {
    // Busca o id do jogador na sala
    const [playerRows] = await db.execute(
        'SELECT id FROM players_rooms WHERE room_id = ? AND player_number = ?',
        [roomDbId, p]
    );
    
          let playerNumber;
if (playerRows.length > 0) {
    // Usuário já está na sala, atualiza o socket_id
    playerNumber = playerRows[0].player_number;
    await db.execute(
        'UPDATE players_rooms SET socket_id = ? WHERE id = ?',
        [socket.id, playerRows[0].id]
    );
} else {
    // Conta quantos jogadores já estão na sala
    let [players] = await db.execute('SELECT COUNT(*) as count FROM players_rooms WHERE room_id = ?', [roomDbId]);
    if (players[0].count >= 2) {
        socket.emit('full');
        return;
    }
    playerNumber = players[0].count;
    await db.execute(
        'INSERT INTO players_rooms (user_id, room_id, player_number, socket_id) VALUES (?, ?, ?, ?)',
        [userId, roomDbId, playerNumber, socket.id]
    );
}

     

    const playerRoomId = playerRows[0].id;
    for (const card of hands[p]) {
        await db.execute(
            'INSERT INTO hands ( player_room_id, card_value, card_suit) VALUES ( ?, ?, ?)',
            [ playerRoomId, card.value, card.suit]
        );
    }
}
            games[roomId] = { deck, hands, table, turn };

// loop para cada jogador
rooms[roomId].forEach(async (sockId, i) => {
  const opponentNumber = 1 - i;

  // Busca dados do oponente
  const [opponent] = await db.execute(`
    SELECT u.firtsname, u.lastname, u.profilephoto
    FROM users u
    JOIN players_rooms pr ON u.id = pr.user_id
    WHERE pr.room_id = ? AND pr.player_number = ?
    LIMIT 1
  `, [roomDbId, opponentNumber]);

  let opponentData = null;
  if (opponent.length) {
    opponentData = {
      name: `${opponent[0].firtsname} ${opponent[0].lastname}`,
      photo: opponent[0].profilephoto
        ? 'data:image/jpeg;base64,' + opponent[0].profilephoto.toString('base64')
        : '/img/default-avatar.png'
    };
  }

  io.to(sockId).emit('gameState', {
    hand: hands[i],
    opponentCardCount: hands[opponentNumber].length,
    table,
    deckCount: deck.length,
    turn,
    opponentData
  });
});

        }



    });





    socket.on('createRoom', async ({ roomId, nameroom, bet, userId }) => {
    
        
         try {
    // verifica se a sala já existe
    const [rows] = await db.execute('SELECT * FROM rooms WHERE code = ?', [roomId]);
    if (rows.length > 0) {
      socket.emit('roomError', { message: 'Código de sala já existente' });
      return;
    }

    // cria a sala
     let [roomRows] = await db.execute('SELECT id FROM rooms WHERE code = ?', [roomId]);
    let roomDbId;
    if (roomRows.length === 0) {
        const [result] = await db.execute('INSERT INTO rooms (code, nameroom, bet) VALUES (?, ?, ?)', [roomId, nameroom, bet]);
        roomDbId = result.insertId;
    } 

    // apenas confirma que a sala foi criada
    socket.emit('roomCreated', { message: 'Sala criada com sucesso!' });
  } catch (err) {
    socket.emit('roomError', { message: 'Erro ao criar sala' });
  }



   

    
    });

socket.on('getGameState', async ({ roomId, player }) => {
    // Descubra o roomDbId
    let [rows] = await db.execute('SELECT id FROM rooms WHERE code = ?', [roomId]);
    if (rows.length === 0) return;
    const roomDbId = rows[0].id;

    // Busca o estado do jogo no banco
    const [handRows] = await db.execute('SELECT card_value, card_suit FROM hands WHERE room_id = ? AND player_room_id = ?', [roomDbId, player]);
    const [deckRows] = await db.execute('SELECT card_value, card_suit FROM decks WHERE room_id = ?', [roomDbId]);
    const [tableRows] = await db.execute('SELECT card_value, card_suit, player_number FROM table_cards WHERE room_id = ?', [roomDbId]);

    // Monte o estado para enviar ao cliente
    socket.emit('gameState', {
        hand: handRows,
        deck: deckRows,
        table: tableRows
        // Adicione outros campos se necessário
    });
});


    socket.on('playCard', async ({ roomId, player, idx }) => {
    const game = games[roomId];
    if (!game) return;
    if (game.turn !== player) return;

    const [card] = game.hands[player].splice(idx, 1);
    game.table.push({ card, player });

    // --- INÍCIO: Atualiza o banco de dados ---
    // Descubra o roomDbId
    let [rows] = await db.execute('SELECT id FROM rooms WHERE code = ?', [roomId]);
    if (rows.length === 0) return;
    const roomDbId = rows[0].id;

    // Remove da mão no banco
    await db.execute(
        'DELETE FROM hands WHERE room_id = ? AND player_room_id = ? AND card_value = ? AND card_suit = ? LIMIT 1',
        [roomDbId, player, card.value, card.suit]
    );
    // Adiciona na mesa no banco
    await db.execute(
        'INSERT INTO table_cards (room_id, card_value, card_suit, player_number) VALUES (?, ?, ?, ?)',
        [roomDbId, card.value, card.suit, player]
    );
    // --- FIM: Atualiza o banco de dados ---

    if (game.table.length === 2) {
        const [play1, play2] = game.table;
        if (play1.card.value > play2.card.value) game.turn = play1.player;
        else if (play1.card.value < play2.card.value) game.turn = play2.player;
        else game.turn = play1.player;
        game.table = [];
    } else {
        game.turn = 1 - game.turn;
    }
    updatePlayers(roomId, game);
});

    socket.on('buyFromDeck', ({ roomId, player }) => {
        const game = games[roomId];
        if (!game) return;
        if (game.turn !== player) return;
        if (game.table.length === 1) {
            let found = false;
            while (game.deck.length > 0) {
                const card = game.deck.shift();
                if (card.suit === game.table[0].card.suit) {
                    game.hands[player].push(card);
                    found = true;
                    break;
                } else {
                    game.hands[player].push(card);
                }
            }
            if (!found) {
                game.hands[player].push(game.table[0].card);
                if (game.table[0].player !== undefined) {
                    game.turn = game.table[0].player;
                }
                game.table = [];
            }
            updatePlayers(roomId, game);
        }
    });

    socket.on('disconnect', async () => {
        // Descobre a sala do socket
        for (const roomId in rooms) {
            const idx = rooms[roomId].indexOf(socket.id);
            if (idx !== -1) {
                rooms[roomId].splice(idx, 1);

                // Busca userId e player_number desse socket
                const [playerRows] = await db.execute(
                    'SELECT user_id, player_number FROM players_rooms WHERE socket_id = ?',
                    [socket.id]
                );
                if (playerRows.length === 0) return;
                const playerNumber = playerRows[0].player_number;

                // Notifica o outro jogador
                rooms[roomId].forEach(sockId => {
                    io.to(sockId).emit('message', 'Seu parceiro caiu. Aguardando reconexão por até 30 minutos...');
                });

                // Inicia timer de 30 minutos
                disconnectTimers[roomId] = setTimeout(() => {
                    const game = games[roomId];
                    if (!game) return;
                    const handCounts = game.hands.map(h => h.length);

                    // Se o jogador que desconectou tinha menos cartas, ambos perdem
                    if (handCounts[playerNumber] < handCounts[1 - playerNumber]) {
                        rooms[roomId].forEach(sockId => {
                            io.to(sockId).emit('message', 'O jogador com menos cartas desconectou. Ambos perderam!');
                        });
                    } else {
                        // Vence quem ficou com menos cartas
                        let winner = handCounts[0] < handCounts[1] ? 0 : 1;
                        rooms[roomId].forEach(sockId => {
                            io.to(sockId).emit('message', `Tempo esgotado! Jogador ${winner + 1} venceu por ter menos cartas.`);
                        });
                    }
                    // Limpa o jogo
                    delete games[roomId];
                    delete rooms[roomId];
                    delete disconnectTimers[roomId];
                }, 30 * 60 * 1000); // 30 minutos

                break;
            }
        }
    });
});

function updatePlayers(roomId, game) {
    rooms[roomId].forEach((sockId, i) => {
        io.to(sockId).emit('gameState', {
            hand: game.hands[i],
            opponentCardCount: game.hands[1 - i].length,
            table: game.table,
            deckCount: game.deck.length,
            turn: game.turn
        });
    });
}

server.listen(3000, () => console.log('Servidor rodando na porta 3000'));