/**
* Методы, вызываемые сервером
* @namespace clientMethods
*/

window.clientMethods = {

	setId: function(connId, pid){
		connection.resetTimer();
		game.pid = pid;
		var oldId = localStorage.getItem('durak_id');
		if(oldId){
			connection.proxy.reconnectClient(oldId);
		}
		else{
			playerManager.pid = pid;
		}
		localStorage.setItem('durak_id', connId);
		connection.id = connId;
	},

	updateId: function(pid){
		if(pid){
			console.log('Reconnected to', pid);
			game.pid = pid;
		}
		else{
			cardManager.reset();
			cardEmitter.start(0, 50, 10, 2000, 20, 1);
			fieldManager.resetNetwork();
			ui.rope.stop();
			ui.cornerButtons.getByName('action').disable();
			ui.cornerButtons.getByName('queueUp').show();
		}
		playerManager.pid = game.pid;
		connection.proxy.requestGameInfo();
	},

	meetOpponents: function(opponents){
		connection.resetTimer();
		if(connection.inDebugMode)
			console.log(opponents);
	},

	recievePossibleActions: function(newActions, time, timeSent){	
		connection.resetTimer();

		actionHandler.handlePossibleActions(newActions, time, timeSent);
		if(connection.inDebugMode)
			console.log(newActions);
	},

	recieveCompleteAction: function(action){
		ui.cornerButtons.getByName('queueUp').hide();
		connection.resetTimer();
		ui.rope.stop();
		ui.cornerButtons.getByName('action').disable();
		var delay = actionHandler.executeAction(action);
		if(!action.noResponse){
			connection.responseTimer = setTimeout(connection.server.sendResponse, !delay && 1 || (delay/game.speed + 300));
		}
		if(connection.inDebugMode)
			console.log(action);
	},

	recieveNotification: function(note, actions){
		connection.resetTimer();
		actionHandler.handleNotification(note, actions);
		if(connection.inDebugMode)
			console.log(note, actions);
	},

	handleLateness: function(){
		if(connection.inDebugMode)
			console.log('Too late');
	}
};
