;
jQuery(function($){
    'use strict';

    /**
     * All the code relevant to Socket.IO is collected in the IO namespace.
     *
     * @type {{init: Function, bindEvents: Function, onConnected: Function, onNewGameCreated: Function, playerJoinedRoom: Function, beginNewGame: Function, onNewWordData: Function, hostCheckAnswer: Function, gameOver: Function, error: Function}}
     */
    var IO = {

        /**
         * This is called when the page is displayed. It connects the Socket.IO client
         * to the Socket.IO server
         */
        init: function() {
            IO.socket = io.connect();
            IO.bindEvents();
        },

        /**
         * While connected, Socket.IO will listen to the following events emitted
         * by the Socket.IO server, then run the appropriate function.
         */
        bindEvents : function() {
            IO.socket.on('connected', IO.onConnected );
            IO.socket.on('newGameCreated', IO.onNewGameCreated );
            IO.socket.on('playerJoinedRoom', IO.playerJoinedRoom );
            IO.socket.on('beginNewGame', IO.beginNewGame );

			IO.socket.on('newMovesData', IO.onNewMovesData);
			IO.socket.on('playerLayoutButtons', IO.onPlayerLayoutButtons);

            IO.socket.on('hostCheckAnswer', IO.hostCheckAnswer);
            IO.socket.on('gameOver', IO.gameOver);
            IO.socket.on('error', IO.error );
			
			IO.socket.on('answerChecked', IO.answerWasChecked);
			
			IO.socket.on('gameOver', IO.gameOver);
        },

        /**
         * The client is successfully connected!
         */
        onConnected : function() {
            // Cache a copy of the client's socket.IO session ID on the App
			console.log('got on connected');
            App.mySocketId = IO.socket.socket.sessionid;
            // console.log(data.message);
        },

        /**
         * A new game has been created and a random game ID has been generated.
         * @param data {{ gameId: int, mySocketId: * }}
         */
        onNewGameCreated : function(data) {
			console.log('got new game created');
            App.Host.gameInit(data);
        },

        /**
         * A player has successfully joined the game.
         * @param data {{playerName: string, gameId: int, mySocketId: int}}
         */
        playerJoinedRoom : function(data) {
            // When a player joins a room, do the updateWaitingScreen funciton.
            // There are two versions of this function: one for the 'host' and
            // another for the 'player'.
            //
            // So on the 'host' browser window, the App.Host.updateWiatingScreen function is called.
            // And on the player's browser, App.Player.updateWaitingScreen is called.

			console.log('got player joined room');

            App[App.myRole].updateWaitingScreen(data);
        },

        beginNewGame : function(data) {
			console.log('got begin new game');
            App[App.myRole].gameCountdown(data);
        },

		onNewMovesData : function(data) {
			console.log('got onnewmoves');
            // Update the current round
            App.currentRound = data.round;

			App[App.myRole].newMoves(data);
        },

		onPlayerLayoutButtons : function(data) {
			console.log('got onplayerlayoutbuttons')
			if(App.myRole === 'Player') {
				App.Player.layoutButtons(data);
			}
        },

        /**
         * A player answered. If this is the host, check the answer.
         * @param data
         */
        hostCheckAnswer : function(data) {
			console.log('got hostCheckAnswer');
            if(App.myRole === 'Host') {
                App.Host.checkMoves(data);
            }
        },
		
		answerWasChecked: function(data) {
			console.log(data.playerId + " " + App.Player.myName)
			if(App.myRole === 'Player' && data.playerId == App.mySocketId) {
				App.Player.onAnswerChecked(data);
			}
		},

        /**
         * Let everyone know the game has ended.
         * @param data
         */
        gameOver : function(data) {
            App[App.myRole].endGame(data);
        },

        /**
         * An error has occurred.
         * @param data
         */
        error : function(data) {
            alert(data.message);
        }

    };

    var App = {

        /**
         * Keep track of the gameId, which is identical to the ID
         * of the Socket.IO Room used for the players and host to communicate
         *
         */
        gameId: 0,

        /**
         * This is used to differentiate between 'Host' and 'Player' browsers.
         */
        myRole: '',   // 'Player' or 'Host'

        /**
         * The Socket.IO socket object identifier. This is unique for
         * each player and host. It is generated when the browser initially
         * connects to the server when the page loads for the first time.
         */
        mySocketId: '',

        /**
         * Identifies the current round. Starts at 0 because it corresponds
         * to the array of word data stored on the server.
         */
        currentRound: 0,

		maxPlayers: 5,

        /* *************************************
         *                Setup                *
         * *********************************** */

        /**
         * This runs when the page initially loads.
         */
        init: function () {
            App.cacheElements();
            App.showInitScreen();
            App.bindEvents();

            // Initialize the fastclick library
            FastClick.attach(document.body);
        },

        /**
         * Create references to on-screen elements used throughout the game.
         */
        cacheElements: function () {
            App.$doc = $(document);

            // Templates
            App.$gameArea = $('#gameArea');
            App.$templateIntroScreen = $('#intro-screen-template').html();
            App.$templateNewGame = $('#create-game-template').html();
            App.$templateJoinGame = $('#join-game-template').html();
            App.$hostGame = $('#host-game-template').html();
        },

        /**
         * Create some click handlers for the various buttons that appear on-screen.
         */
        bindEvents: function () {
            // Host
            App.$doc.on('click', '#btnCreateGame', App.Host.onCreateClick);

            // Player
            App.$doc.on('click', '#btnJoinGame', App.Player.onJoinClick);
            App.$doc.on('click', '#btnJoinStart',App.Player.onPlayerJoinClick);
            App.$doc.on('click', '.btnAnswer',App.Player.onPlayerButtonClick);
            App.$doc.on('click', '#btnPlayerRestart', App.Player.onPlayerRestart);
        },

        /* *************************************
         *             Game Logic              *
         * *********************************** */

        /**
         * Show the initial Title Screen
         * (with Start and Join buttons)
         */
        showInitScreen: function() {
            App.$gameArea.html(App.$templateIntroScreen);
            App.doTextFit('.title');
        },


        /* *******************************
           *         HOST CODE           *
           ******************************* */
        Host : {

            /**
             * Contains references to player data
             */
            players : [],

			      playersReady: 0,

            /**
             * Flag to indicate if a new game is starting.
             * This is used after the first game ends, and players initiate a new game
             * without refreshing the browser windows.
             */
            isNewGame : false,

            /**
             * Keep track of the number of players that have joined the game.
             */
            numPlayersInRoom: 0,

			       /**
             * Simon's moves.
             */

			      moves : [],

			      speed : 1000,

            /**
             * Handler for the "Start" button on the Title Screen.
             */
            onCreateClick: function () {
                // console.log('Clicked "Create A Game"');
                IO.socket.emit('hostCreateNewGame');
            },

            /**
             * The Host screen is displayed for the first time.
             * @param data{{ gameId: int, mySocketId: * }}
             */
            gameInit: function (data) {
                App.gameId = data.gameId;
                App.mySocketId = data.mySocketId;
                App.myRole = 'Host';
                App.Host.numPlayersInRoom = 0;

                App.Host.displayNewGameScreen();
                console.log("Game started with ID: " + App.gameId + ' by host: ' + App.mySocketId);
            },

            /**
             * Show the Host screen containing the game URL and unique game ID
             */
            displayNewGameScreen : function() {
                // Fill the game screen with the appropriate HTML
                App.$gameArea.html(App.$templateNewGame);

                // Display the URL on screen
                $('#gameURL').text(window.location.href);
                App.doTextFit('#gameURL');

                // Show the gameId / room id on screen
                $('#spanNewGameCode').text(App.gameId);
            },

            /**
             * Update the Host screen when the first player joins
             * @param data{{playerName: string}}
             */
            updateWaitingScreen: function(data) {
                // If this is a restarted game, show the screen.
                if ( App.Host.isNewGame ) {
                    App.Host.displayNewGameScreen();
                }
                // Update host screen
                $('#playersWaiting')
                    .append('<p/>')
                    .text('Player ' + data.playerName + ' joined the game.');

                // Store the new player's data on the Host.
                App.Host.players.push(data);

                // Increment the number of players in the room
                App.Host.numPlayersInRoom += 1;
				        console.log("players" + App.Host.numPlayersInRoom);

                // If two players have joined, start the game!
                if (App.Host.numPlayersInRoom === App.maxPlayers) {
                    // console.log('Room is full. Almost ready!');

                    // Let the server know that two players are present.
                    IO.socket.emit('hostRoomFull',App.gameId);
                }
            },

            /**
             * Show the countdown screen
             */
            gameCountdown : function() {

                // Prepare the game screen with new HTML
                App.$gameArea.html(App.$hostGame);
                App.doTextFit('#hostWord');

                // Begin the on-screen countdown timer
                var $secondsLeft = $('#hostWord');
                App.countDown( $secondsLeft, 5, function(){
                    IO.socket.emit('hostCountdownFinished', App.gameId);
                });

				$('#timeLeftText').text("");

                /*// Display the players' names on screen
                $('#player1Score')
                    .find('.playerName')
                    .html(App.Host.players[0].playerName);

                $('#player2Score')
                    .find('.playerName')
                    .html(App.Host.players[1].playerName);

                // Set the Score section on screen to 0 for each player.
                $('#player1Score').find('.score').attr('id',App.Host.players[0].mySocketId);
                $('#player2Score').find('.score').attr('id',App.Host.players[1].mySocketId);*/
            },

			newMoves : function(data) {
				var newMovesIndex = App.Host.moves.length;
				App.Host.moves = App.Host.moves.concat(data.moves);
				console.log('the moves' + data.moves + ' ' + data.gameId);
				console.log(App.Host.moves);
                App.Host.currentRound = data.round;

				var newData = {
                    gameId : App.gameId,
                    round : App.currentRound,
					moves : App.Host.moves
                }

				console.log("newMoves" + data.gameId);

				var numberOfMoves = App.Host.moves.length;
				var currentMove = 0;

				var readySetGo = ["", "Ready", "Go!"];
				var currentReady = 0;

				$('#timeLeftText').text("Preparation");

				$('#hostWord').css({
					'color':'black'
				});

				var readyTimer = setInterval(readyTimerFunction,1000);
				var flag = false;
				var pause = false;

				function readyTimerFunction() {
					if(!flag) {
						$('#hostWord').text(readySetGo[currentReady]);
						App.doTextFit('#hostWord');
						currentReady ++;

						if(currentReady > readySetGo.length) {
							$('#hostWord').text("");
							flag = true;
							$('#timeLeftText').text("Memorization");
						}
					} else {
						if(!pause) {
							$('#hostWord').text(App.Host.moves[currentMove]);
							App.doTextFit('#hostWord');
							currentMove ++;
							pause = true;
						} else {
							$('#hostWord').text("");
							App.doTextFit('#hostWord');
							pause = false;
						}

						if(currentMove > newMovesIndex) {
							$('#hostWord').css({
								'color':'yellow'
							});
							App.doTextFit('#hostWord');
						}

						if(currentMove > numberOfMoves){
							$('#timeLeftText').text("Repeat!");
							clearInterval(readyTimer);
							IO.socket.emit('hostNewMovesFinished', newData);
							return;
						}
					}
				}
            },

			checkMoves : function(data) {
                // Verify that the answer clicked is from the current round.
                // This prevents a 'late entry' from a player whos screen has not
                // yet updated to the current round.
				console.log('check');
                if (data.round === App.currentRound){
					console.log('round pass');
                    // Get the player's score
                    var $pScore = $('#' + data.playerId);

					console.log(App.Host.moves);
					console.log(data.moves);		
					
					// Update host screen
					$('#hostWord').css({
						'color':'black'
					});

                    $('#hostWord')
                        .append('<p>' + data.playerName + ' has submitted an answer.</p>')

					App.doTextFit('#hostWord');
					
                    // Advance player's score if it is correct
                    if( App.Host.moves.toString() === data.moves.toString() ) {
						console.log('correct');
                        // Add 5 to the player's score
                        App.Host.playersReady ++;
											
						var resultData = {
							gameId : App.gameId,
							round : App.currentRound,
							correct : 1,
							playerId : data.playerId
						}
						
						IO.socket.emit('playerAnswerChecked', resultData);

                    } else {
                        // A wrong answer was submitted, so decrement the player's score.
						console.log('wrong');
                        App.Host.numPlayersInRoom --;
										
						var resultData = {
							gameId : App.gameId,
							round : App.currentRound,
							correct : 0,
							playerId : data.playerId
						}
						
						IO.socket.emit('playerAnswerChecked', resultData);
                    }

					if(App.Host.playersReady === App.Host.numPlayersInRoom) {
						if(App.Host.numPlayersInRoom <= 1) {
							var data = {
								gameId : App.gameId,
								round : App.currentRound
							}
							IO.socket.emit('gameOver', data);
						} else {
							App.Host.playersReady = 0;
							App.currentRound += 1;

							var data = {
								gameId : App.gameId,
								round : App.currentRound
							}

							IO.socket.emit('hostNextRound',data);
						}
					}
                }
            },

            /**
             * All 10 rounds have played out. End the game.
             * @param data
             */
            endGame : function(data) {
				$('#timeLeftText').text('');
                $('#hostWord').text('Game Over');
 
                App.doTextFit('#hostWord');

                // Reset game data
                App.Host.numPlayersInRoom = 0;
                App.Host.isNewGame = true;
            },

            /**
             * A player hit the 'Start Again' button after the end of a game.
             */
            restartGame : function() {
                App.$gameArea.html(App.$templateNewGame);
                $('#spanNewGameCode').text(App.gameId);
            }
        },


        /* *****************************
           *        PLAYER CODE        *
           ***************************** */

        Player : {

            /**
             * A reference to the socket ID of the Host
             */
            hostSocketId: '',

            /**
             * The player's name entered on the 'Join' screen.
             */
            myName: '',

			canAnswer: true,

			playerMoves: [],

			numberOfMoves: '',

            /**
             * Click handler for the 'JOIN' button
             */
            onJoinClick: function () {
                // console.log('Clicked "Join A Game"');

                // Display the Join Game HTML on the player's screen.
                App.$gameArea.html(App.$templateJoinGame);
            },

            /**
             * The player entered their name and gameId (hopefully)
             * and clicked Start.
             */
            onPlayerJoinClick: function() {
                console.log('Player clicked "Join"');

                // collect data to send to the server
                var data = {
                    gameId : +($('#inputGameId').val()),
                    playerName : $('#inputPlayerName').val() || 'anon'
                };

                // Send the gameId and playerName to the server
                IO.socket.emit('playerJoinGame', data);

                // Set the appropriate properties for the current player.
                App.myRole = 'Player';
                App.Player.myName = data.playerName;

				var $btn = $(this);
				$btn.text('Start');
				//$btn.off('click');
				App.$doc.off('click', '#btnJoinStart', App.Player.onPlayerJoinClick);
				App.$doc.on('click', '#btnJoinStart', App.Player.onPlayerStartClick);
            },

			onPlayerStartClick: function() {
				var data = {
                    gameId : +($('#inputGameId').val()),
                    playerName : $('#inputPlayerName').val() || 'anon'
                };
				IO.socket.emit('playerStartGame', data);
			},
			
			onAnswerChecked: function(data) {
				if(data.correct == 0) {
					$('#gameArea')
					.html('<div class="gameOver">Game Over!</div>');
					stillIn = false;
				} else {
					$('#gameArea')
					.html('<div class="gameOver">Correct!</div>');
				}
			},

			onPlayerButtonClick: function() {
				console.log('Clicked Answer Button');
                var $btn = $(this);      // the tapped button
                var answer = $btn.val(); // The tapped word

				App.Player.playerMoves.push(parseInt(answer));
				console.log(App.Player.playerMoves.length);
				if(App.Player.playerMoves.length == App.Player.numberOfMoves) {
					console.log('send');
					var data = {
						gameId: App.gameId,
						playerId: App.mySocketId,
						playerName: App.Player.myName,
						moves: App.Player.playerMoves,
						round: App.currentRound
					}
					IO.socket.emit('playerAnswer',data);
					App.Player.playerMoves = [];
					$('#gameArea')
                    .html('<div class="gameOver">Pay attention to the main screen!</div>');
				}
			},

            /**
             *  Click handler for the "Start Again" button that appears
             *  when a game is over.
             */
            onPlayerRestart : function() {
                var data = {
                    gameId : App.gameId,
                    playerName : App.Player.myName
                }
                IO.socket.emit('playerRestart',data);
                App.currentRound = 0;
                $('#gameArea').html("<h3>Waiting on host to start new game.</h3>");
            },

            /**
             * Display the waiting screen for player 1
             * @param data
             */
            updateWaitingScreen : function(data) {
                if(IO.socket.socket.sessionid === data.mySocketId){
                    App.myRole = 'Player';
                    App.gameId = data.gameId;

                    $('#playerWaitingMessage')
                        .append('<p/>')
                        .text('Joined Game ' + data.gameId + '. Please wait for game to begin.');
                }
            },

            /**
             * Display 'Get Ready' while the countdown timer ticks down.
             * @param hostData
             */
            gameCountdown : function(hostData) {
                App.Player.hostSocketId = hostData.mySocketId;
                $('#gameArea')
                    .html('<div class="gameOver">Get Ready!</div>');
            },

			newMoves : function(data) {
				 $('#gameArea')
                    .html('<div class="gameOver">Pay attention to the main screen!</div>');
			},

			//Layout simon says buttons
			layoutButtons : function(data) {
				console.log("Layout Buttons WIth: " + App.gameId + ' by host: ' + App.mySocketId);
                var $list = $('<ul/>').attr('id','ulAnswers');

				var numberOfButtons = [1, 2, 3 ,4];

				App.Player.numberOfMoves = data.moves.length;

				console.log('layout buttons length' + App.Player.numberOfMoves);

                $.each(numberOfButtons, function(){
                    $list
                        .append( $('<li/>')
                            .append( $('<button/>')
                                .addClass('btnAnswer')
                                .addClass('btn')
								.val(this)
                                .html(this)
                            )
                        )
                });

                $('#gameArea').html($list);
            },

            /**
             * Show the "Game Over" screen.
             */
            endGame : function() {
  
            }
        },


        /* **************************
                  UTILITY CODE
           ************************** */

        /**
         * Display the countdown timer on the Host screen
         *
         * @param $el The container element for the countdown timer
         * @param startTime
         * @param callback The function to call when the timer ends.
         */
        countDown : function( $el, startTime, callback) {

            // Display the starting time on the screen.
            $el.text(startTime);
            App.doTextFit('#hostWord');

            // console.log('Starting Countdown...');

            // Start a 1 second timer
            var timer = setInterval(countItDown,1000);

            // Decrement the displayed timer value on each 'tick'
            function countItDown(){
                startTime -= 1
                $el.text(startTime);
                App.doTextFit('#hostWord');

                if( startTime <= 0 ){
                    // console.log('Countdown Finished.');

                    // Stop the timer and do the callback.
                    clearInterval(timer);
                    callback();
                    return;
                }
            }

        },

        /**
         * Make the text inside the given element as big as possible
         * See: https://github.com/STRML/textFit
         *
         * @param el The parent element of some text
         */
        doTextFit : function(el) {
            textFit(
                $(el)[0],
                {
                    alignHoriz:true,
                    alignVert:false,
                    widthOnly:true,
                    reProcess:true,
                    maxFontSize:300
                }
            );
        }

    };

    IO.init();
    App.init();

}($));
