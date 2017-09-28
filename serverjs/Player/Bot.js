/*
	Серверные боты
*/

'use strict';

const
	generateId = require('../generateId'),
	Log = require('../logger'),
	Player = require('./Player');


class Bot extends Player{
	constructor(randomNames, queueType, decisionTime){
		super(null, null, null, false);
		this.id = 'bot_' + generateId();
		this.log = Log(module, this.id);
		this.type = 'bot';
		this.queueType = queueType;
		this.connected = true;
		this.actionTimeout = null;

		if(typeof decisionTime != 'number' || isNaN(decisionTime)){
			decisionTime = 1500;
		}
		this.decisionTime = decisionTime;

		let nameIndex = Math.floor(Math.random()*randomNames.length);
		if(randomNames.length){
			this.name = randomNames[nameIndex];
			randomNames.splice(nameIndex,1);
		}
		else{
			this.name = this.id;
		}
	}

	getDecisionTime(addedTime){
		if(!this.game){
			return 0;
		}
		let minTime = this.game.fakeDecisionTimer || 0;

		if(addedTime === undefined || minTime === 0){
			addedTime = 0;
		}
		return Math.random()*addedTime + minTime;
	}


	// Получение действий //

	recieveGameInfo(info){
		if(!info.noResponse){
			this.sendDelayedResponse();
		}
	}

	recieveDeals(deals){
		this.sendDelayedResponse();
	}

	recieveValidActions(actions, deadline, roles, turnIndex, turnStage){
		clearTimeout(this.actionTimeout);
		if(actions.length){
			this.actionTimeout = setTimeout(() => {
				if(!this.game || !this.game.active){
					this.log.warn('No game or game is inactive');
					return;
				}
				console.log('RECEIVED ACTIONS: ', actions);
				this.sendResponseSync(this.chooseBestAction(actions));

			}, this.getDecisionTime(this.decisionTime));
		}
	}

	recieveCompleteAction(action){
		if(!action.noResponse){
			this.sendDelayedResponse();
		}
	}

	recieveNotification(action){
		if(action.noResponse){
			return;
		}
		clearTimeout(this.actionTimeout);
		if(action.actions){
			let ai = (this.game && this.game.isTest || this.queueType == 'botmatch') ? 0 : 1;
			this.sendDelayedResponse(action.actions[ai]);
		}			
	}


	// Отправка ответов //

	sendDelayedResponse(action){
		clearTimeout(this.actionTimeout);
		this.actionTimeout = setTimeout(() => {
			this.sendResponseSync(action);
		}, this.getDecisionTime());
	}

	// Синхронно посылает синхронный ответ серверу
	// Асинхронность должна быть создана перед вызовом
	sendResponseSync(action){
		if(!this.game){
			this.log.warn('No game has been assigned', action);
			return;
		}
		if(!this.game.active){
			return;
		}
		this.game.recieveResponseSync(this, action || null);
	}

	// Асинхронно посылает синхронный ответ серверу с коллбэком (для тестов)
	sendResponseWithCallback(action, callback){
		if(!this.game){
			this.log.warn('No game has been assigned', action);
			return;
		}
		clearTimeout(this.actionTimeout);
		this.actionTimeout = setTimeout(() => {
			this.sendResponseSync(action);
			if(callback){
				callback();
			}
		},0);
	}

    chooseBestAction(actions){
        /**
        * Метод, возвращающий наиболее выгодное для бота действие.
        */
		console.log('TABLE', this.game.table);

		let gameStage = this.defineGameStage(),
			minAction =  this.findMinAction(actions),
			allowedCardsIDs = this.getAllowedCardsIDs(actions),
			passAction = this.findPassAction(actions),
			takeAction = this.findTakeAction(actions),
			maxQtyCard = this.findMaxQtyCard(minAction, allowedCardsIDs, gameStage);
		//let trumpCardsQty = this.findTrumpCardsQty(); //не используется?

		console.log('Min Action ', minAction);
		
        switch (this.defineTurnType()){
            case 'ATTACK':
				if (passAction && ( (!this.isAttackActionBeneficial(minAction, gameStage)) || this.isPassActionBeneficial(minAction, gameStage)) ){
					return passAction;
				}

				if (maxQtyCard){
					return this.changeCardIntoAction(actions, maxQtyCard);
				}

				return minAction;
            
            case 'SUPPORT':
				/*
				* Придумать более глубокий алгоритм выбора карты.
				* Написать функцию, проверяющую, эффективно ли подкидывание.
				*/
                if (minAction && (minAction.cvalue < 11) && (minAction.csuit !== this.game.cards.trumpSuit)){
					return minAction;
                }
                
				return passAction;
                
            case 'DEFENSE':
				let cardsOnTheTableValues = this.findCardsOnTheTableValues(),
					minActionWithValueOnTheTable = this.findMinAction(actions, cardsOnTheTableValues),
					bestTransferAction = this.findMinAction(actions, undefined , true);

				console.log('lowestActionWithValueOnTheTable: ', minActionWithValueOnTheTable);

				if ((bestTransferAction) && this.isTransferBeneficial(gameStage, bestTransferAction, actions)){
            		return bestTransferAction;
				}

				if ((!minAction) || this.isTakeActionBeneficial(gameStage, minAction, actions)){
					return takeAction;
				}

				if (minActionWithValueOnTheTable && this.isMinActionWithValueOnTheTableBeneficial(gameStage, minActionWithValueOnTheTable)){
					return minActionWithValueOnTheTable;
				}

            	if (maxQtyCard){
					return this.changeCardIntoAction(actions, maxQtyCard);
				}

				return minAction;
        }
	}

    findMinAction(actions, cardsOnTheTableValues, isTransfer){
        /** 
        * Метод, возврающий наименьшую карту из тех, которыми можно походить.
        */  
        let minAction = {
            cvalue: Infinity
        };
    
        for (let i = 0; i < actions.length; i++){
            if ( (actions[i].type === 'TAKE') || (actions[i].type === 'PASS') || (isTransfer && (actions[i].type === 'DEFENSE') ) ||
			   (cardsOnTheTableValues && ( (actions[i].type !== 'DEFENSE') || (!~cardsOnTheTableValues.indexOf(actions[i].cvalue)) ) )){
                continue;
            }

			if ( (minAction.csuit === this.game.cards.trumpSuit) && (actions[i].csuit !== this.game.cards.trumpSuit) ){
				minAction = actions[i];
				continue;
			}
            
            if ((actions[i].cvalue < minAction.cvalue) &&
				((actions[i].csuit === this.game.cards.trumpSuit) && ((minAction.csuit === this.game.cards.trumpSuit) || (minAction.csuit === undefined))) ||
				((minAction.csuit !== this.game.cards.trumpSuit) && (actions[i].csuit !== this.game.cards.trumpSuit))){
                minAction = actions[i];
            }
         }
		
        if (minAction.cvalue !== Infinity){
            /**
            * Если наиболее выгодное действие было найдено, 
            * то метод возвращает его
            */
            return minAction;
        }
    }

    findPassAction(actions){
       /**
        * Метод, возвращающий действие типа 'PASS', если такое есть. Иначе возвращается undefined.
        */
        for (let i = 0; i < actions.length; i++){
            if (actions[i].type === 'PASS'){
                return actions[i];
            }
        } 
    }

    findTakeAction(actions){
        /**
        * Метод, возвращающий действие типа 'TAKE', если такое есть. Иначе возвращается undefined.
        */
        for (let i = 0; i < actions.length; i++){
            if (actions[i].type === 'TAKE'){
                return actions[i];
            }
        } 
    }

    defineTurnType(){
        /**
        * Метод, определяющий тип действия, которое нужно совершить боту.
        */
        if (this.statuses.role === 'defender'){
            return 'DEFENSE';
        }
        
//       if ((this.statuses.role === 'attacker') && (this.statuses.roleIndex > 1)){
//		   return 'SUPPORT';
//	   }
		
        return 'ATTACK';
    }

    defineGameStage(){
        /**
        * Метод, определяющий стадию игры.
        */
        let gameStages = ['EARLY_GAME', 'END_GAME'];
        
        if (this.game.deck.length < 5){
            return gameStages[1];
        }
        
        return gameStages[0];
    }

    findMaxQtyCard(minAction, allowedCardsIDs, gameStage){
        /*
		* !!!! Подумать над тем, как использовать это метод при защите. Как найти карту(ы), которую надо побить данной картой(ами). (minDifference???)
        * Метод, находящий id пары или тройки карт одного типа, которые не являются козырными и меньше J.
		* При этом разница между этой парой(тройкой) и минимальной картой, которой можно походить, не 
		* должна быть больше 2.
		* В итоге выводится одно из этих действий. В приоритете выбор с самой частой мастью. Или мастью не равной самой редкой.
        */
		if (!minAction){
			return undefined;
		}
		
        let cardsInHand = this.game.hands[this.id];
		let cardsByValue = {};
		/*
		* Заполяем объект cardsByValue
		*/
		for (let i = 0; i < cardsInHand.length; i++){
			if ((cardsInHand[i].suit !== this.game.cards.trumpSuit) && ((gameStage === 'END_GAME') || (cardsInHand[i].value < 11)) &&
			   (cardsInHand[i].value <= (minAction.cvalue + 2) && (~allowedCardsIDs.indexOf(cardsInHand[i].id)))){
				if (!cardsByValue[cardsInHand[i].value]){
					cardsByValue[cardsInHand[i].value] = [];
				}

				cardsByValue[cardsInHand[i].value].push(cardsInHand[i]);
			}
		}

		let maxQtyCards = [];

		console.log('CARDS BY VALUE: ');
		console.log(cardsByValue);

		for (let value in cardsByValue){
			if (cardsByValue[value].length > maxQtyCards.length){
				maxQtyCards = cardsByValue[value];
			}
		}

		if (maxQtyCards.length){
			let rareSuit = this.findRareSuit(),
				commonSuit = this.findCommonSuit();

			for (let i = 0; i < maxQtyCards.length; i++){
				if (maxQtyCards[i].suit === commonSuit){
					return maxQtyCards[i];
				}
			}

			for (let i = 0; i < maxQtyCards.length; i++){
				if (maxQtyCards[i].suit !== rareSuit){
					return maxQtyCards[i];
				}
			}

			return maxQtyCards[0];
		}
    }

	isThisValueOut(value){
		/*
		* Метод, проверяющий, вышли ли оставшиеся карты этого типа из игры (которых нету у этого бота в руке).
		* Для проверки используются только данные этого бота и стопки сброса.
		* НЕ ПРОТЕСТИРОВАНО
		*/
		let cardsInHand = this.game.hands[this.id],
			valueQty = 4;

		for (let i = 0; i < cardsInHand.length; i++){
			if (cardsInHand[i].value === value){
				valueQty--;
			}
		}

		for (let i = 0; i < this.game.discardPile.length; i++){
			if (this.game.discardPile[i].value === value){
				valueQty--;
			}
		}

		if (valueQty){
			return true;
		}

		return false;
	}

	changeCardIntoAction(actions, card){
		/*
		* Метод, получающий из карты, доступное с ней действие.
		*/
		for (let i = 0; i < actions.length; i++){
			if (actions[i].cid === card.id){
				return actions[i];
			}
		}
	}

	getAllowedCardsIDs(actions){
		let allowedCardsIDs = [];

		for (let i = 0; i < actions.length; i++){
			if (!~allowedCardsIDs.indexOf(actions[i].cid)){
				allowedCardsIDs.push(actions[i].cid);
			}
		}

		return allowedCardsIDs;
	}

	getDefensePlayerID(){
		for (let i = 0; i < this.game.players.length; i++){
			if (this.game.players[i].statuses.role === 'defender'){
				return this.game.players[i].id;
			}
		}
	}
	/*
	*
	* Методы, работающие со столом.
	*
	*/
	findAttackCardOnTheTable(field){
		for (let i = 0; i < this.game.table.length; i++){
			if (this.game.table[i].id === field){
                return this.game.table[i].attack;
            }
		}
	}

	findCardsOnTheTable(){
        /**
        * Метод, возвращающий все карты на столе.
        */
        let cards = [];

        for (let i = 0; i < this.game.table.length; i++){
            if (this.game.table[i].attack !== null){
                cards.push(this.game.table[i].attack);
            }

            if (this.game.table[i].defense !== null){
                cards.push(this.game.table[i].defense);
            }
        }

        return cards;
    }

	findCardsOnTheTableValues(){
        /**
        * Метод, возвращающий значения всех карт на столе.
        */
        let cardsValues = [];

        for (let i = 0; i < this.game.table.length; i++){
            if (this.game.table[i].attack !== null){
                cardsValues.push(this.game.table[i].attack.value);
            }

            if (this.game.table[i].defense !== null){
                cardsValues.push(this.game.table[i].defense.value);
            }
        }

        return cardsValues;
    }

    findNullDefenseCardsOnTheTable(){
        /**
        * Метод, возвращающий карты атакующих на столе.
        */
        let cards = [];

        for (let i = 0; i < this.game.table.length; i++){
            if ((this.game.table[i].attack !== null) && (this.game.table[i].defense === null)){
                cards.push(this.game.table[i].attack);
            }
        }

        return cards;
    }

    findDefenseCardsOnTheTable(){
        /**
        * Метод, возвращающий карты защищающегося на столе.
        */
        let cards = [];

        for (let i = 0; i < this.game.table.length; i++){
            if (this.game.table[i].defense !== null){
                cards.push(this.game.table[i].defense);
            }
        }

        return cards;
    }

	isBeatableOnlyByThis(cardAction, actions){
		/*
		* Метод, возвращающий true, если на столе есть карты, которые бьются только картой из cardAction.
		*/
		let cardsOnTheTable = this.findNullDefenseCardsOnTheTable(),
			beatableCards = [];

		for (let i = 0; i < actions.length; i++){
			if ( (actions[i].field !== cardAction.field) && (!~beatableCards.indexOf(actions[i].field)) ){
					beatableCards.push(actions[i].field);
				}
		}

		if (beatableCards.length === cardsOnTheTable.length){
			return false;
		}

		return true;
	}

	isNotBeatable(actions){
		/*
		* Метод, возвращающий true, если на столе есть карты, которые нельзя побить.
		*/
		let cardsOnTheTable = this.findNullDefenseCardsOnTheTable(),
			beatableCards = [];

		for (let i = 0; i < actions.length; i++){
			if ((!~beatableCards.indexOf(actions[i].field)) && (actions[i].field !== undefined)){
					beatableCards.push(actions[i].field);
			}
		}

		console.log('Beatable Cards ', beatableCards);
		console.log('Beatable Cards length', beatableCards.length);
		console.log('Cards On TheTable length', cardsOnTheTable.length);

		if (beatableCards.length === cardsOnTheTable.length){
			return false;
		}

		return true;
	}
	/*
	*
	* Методы, работающие с рукой бота.
	*
	*/
	findRareSuit(){
		/**
		* Метод, определяющий наиболее редкую масть в руке бота (помимо козыря).
		*/
		let cardsInHand = this.game.hands[this.id],
			suits = [0, 0, 0, 0];

		suits[this.game.cards.trumpSuit] = Infinity;

		for (let i = 0; i < cardsInHand.length; i++){
			if (cardsInHand[i].suit !== this.game.cards.trumpSuit){
				suits[cardsInHand[i].suit]++;
			}
		}

		return suits.indexOf(Math.min(suits[0], suits[1], suits[2], suits[3]));
	}

	findCommonSuit(){
		/**
		* Метод, определяющий наиболее частую масть в руке бота (помимо козыря).
		*/
		let cardsInHand = this.game.hands[this.id],
			suits = [0, 0, 0, 0];

		suits[this.game.cards.trumpSuit] = -Infinity;

		for (let i = 0; i < cardsInHand.length; i++){
			if (cardsInHand[i].suit !== this.game.cards.trumpSuit){
				suits[cardsInHand[i].suit]++;
			}
		}

		return suits.indexOf(Math.max(suits[0], suits[1], suits[2], suits[3]));
	}

	findTrumpCardsQty(){
		/**
		* Метод, находящий количество козырей в руке у бота.
		*/
		let cardsInHand = this.game.hands[this.id];
		let trumpCardsQty = 0;

		for (let i = 0; i < cardsInHand.length; i++){
			if (cardsInHand[i].suit === this.game.cards.trumpSuit){
				trumpCardsQty++;
			}
		}

		return trumpCardsQty;
	}
	/*
	*
	* Методы, определяющие полезность чего-либо.
	*
	*/
	isTransferBeneficial(gameStage, transferAction, actions){
        /**
        * Метод, определяющий эффективность перевода.
		*
        * В начале игры перевод выгоден, если бот не переводит козырем или козырем, меньшем 5.
        */
		let trumpSuitQty = this.findTrumpCardsQty();

        if ( (gameStage === 'EARLY_GAME') && ( (transferAction.csuit !== this.game.cards.trumpSuit) || ((transferAction.cvalue < 5) && (trumpSuitQty > 1)) ||
											( (transferAction.cvalue < 11) && ((this.game.table.usedFields > 1) || this.isBeatableOnlyByThis(transferAction, actions)) ) )){
            return true;
        }
        /**
        * В конце игры перевод выгоден, если бот не переводит козырем или козырем, меньшем J.
        */
        if ((gameStage === 'END_GAME') && ( (transferAction.csuit !== this.game.cards.trumpSuit) ||
										   ( (transferAction.cvalue < 11) && ( (trumpSuitQty > 0) ||
																			 this.isBeatableOnlyByThis(transferAction, actions) ) ))){
            return true;
        }

        return false;
    }

	isAttackActionBeneficial(minAction, gameStage){
		// getDefensePlayerID
		// this.game.hands[this.id]
		// this.turnStages.current === 'FOLLOWUP'
		if (!minAction){
			return false;
		}

		let defensePlayerCardsQty = this.game.hands[this.getDefensePlayerID()].length;

		if ( (defensePlayerCardsQty < 3) && (this.game.turnStages.current !== 'FOLLOWUP') &&
			( (minAction.csuit === this.game.cards.trumpSuit) && (minAction.cvalue < 11) ||
			(minAction.csuit !== this.game.cards.trumpSuit))){
			return true;
		}

		if ( (defensePlayerCardsQty < 4) && (this.game.turnStages.current !== 'FOLLOWUP') &&
			( (minAction.csuit === this.game.cards.trumpSuit) && (minAction.cvalue < 6) ||
			(minAction.csuit !== this.game.cards.trumpSuit))){
			return true;
		}

		if ((defensePlayerCardsQty < 5) && (this.game.turnStages.current !== 'FOLLOWUP') &&
			(minAction.csuit !== this.game.cards.trumpSuit)){
			return true;
		}

		return false;
	}

	isPassActionBeneficial(minAction, gameStage){
		if ((!minAction) || ( (minAction.csuit === this.game.cards.trumpSuit) || (minAction.cvalue > 10) )){
			return true;
		}

		return false;
	}

	isTakeActionBeneficial(gameStage, minAction, actions){
		if ( this.isNotBeatable(actions) || ( (gameStage !== 'END_GAME') && (minAction.csuit === this.game.cards.trumpSuit) &&
			( ((this.game.table.usedFields === 1) && (this.game.hands[this.id].length < 7)) ||
			 ((this.game.table.usedFields === 2) && (minAction.cvalue > 10)) ) ) ){
			return true;
		}

		return false;
	}

	isMinActionWithValueOnTheTableBeneficial(gameStage, minActionWithValueOnTheTable){
		if ( (minActionWithValueOnTheTable.value - (this.findAttackCardOnTheTable(minActionWithValueOnTheTable.field)).value <= 3) &&
					( ((gameStage === 'EARLY_GAME') && (minActionWithValueOnTheTable.csuit !== this.game.cards.trumpSuit)) ||
						(minActionWithValueOnTheTable.value < 11) || (minActionWithValueOnTheTable.csuit !== this.game.cards.trumpSuit) ) ){
			return true;
		}

		return false;
	}
}

module.exports = Bot;