'use strict';

const
	BetterArray = reqfromroot('BetterArray'),
	GameCards = reqfromroot('Game/GameCards'),
	Card = reqfromroot('Card/Card');

class DurakCards extends GameCards{
	constructor(game){
		super(game, {
			card: Card,
			normalHandSize: 6,
			lowestValue: 0,
			numOfSuits: 4,
			maxValue: 14
		});

		this.table = new BetterArray();
		this.table.usedFields = 0;
		this.table.maxLength = 6;
		this.table.fullLength = 0;
		this.table.zeroDiscardLength = Math.max(this.table.maxLength - 1, 1);

		this.trumpSuit = null;
	}

	static get [Symbol.species]() { return Array; }

	createValues(){
		const game = this.game;
		
		// Значения карт
		this.values.length = 0;
		
		// Задаем количество карт и минимальное значение карты
		if(game.players.length > 3){
			this.lowestValue = 2;
		}
		else{
			this.lowestValue = 6;
		}

		// Задаем значения карт
		for (let i = this.lowestValue; i <= this.maxValue; i++) {
			this.values.push(i);
		}	
	}

	// Стол

	// Возвращает первое свободное место на столе
	get firstEmptyTable(){
		let tableField = this.table.find((t, i) => {
			return i < this.table.fullLength && !t.attack && !t.defense;
		});
		return tableField;
	}

	get defenseFields(){
		let defenseFields = [];
		this.table.forEach((tableField) => {
			if(tableField.attack && !tableField.defense){
				defenseFields.push(tableField);
			} 
		});
		return defenseFields;
	}

	get lockedFieldsIds(){
		let lockedFields = [];
		for(let i = this.table.fullLength; i < this.table.maxLength; i++){
			lockedFields.push(this.table[i].id);
		}
		return lockedFields;
	}


	// Поля

	addDeckInfo(cardsInfo, pid, reveal){
		this.deck.forEach((card) => {
			let newCard = card.info;

			// Игроки знают только о значении карты на дне колоды
			if(card.field != 'BOTTOM' && !reveal){
				newCard.value = null;
				newCard.suit = null;			
			} 
			if(newCard.field == 'BOTTOM'){
				newCard.field = 'DECK';
			}
			cardsInfo.unshift(newCard);
		});
	}

	addTableInfo(cardsInfo, pid, reveal){
		this.table.forEach((tableField) => {
			if(tableField.attack){
				let card = tableField.attack;
				let newCard = card.info;
				cardsInfo.push(newCard);
			}
			if(tableField.defense){
				let card = tableField.defense;
				let newCard = card.info;
				cardsInfo.push(newCard);
			}		
		});
	}

	// Обнуляет карты
	reset(soft){

		super.reset(soft);
		
		this.table.length = this.table.maxLength;		
		this.table.fullLength = this.table.zeroDiscardLength;
		for(let i = 0; i < this.table.length; i++) {
			let id = 'TABLE'+i;
			let tableField = {
				attack: null,
				defense: null,
				id: id
			};
			this.table[i] = tableField;
		}
	}


	// Создает карты, поля и руки
	make(){
		super.make();

		// Запоминаем козырь
		this.findTrumpCard();
	}

	// Находит козырную карту
	findTrumpCard(){
		// Находим первый попавшийся не туз и кладем его на дно колоды, это наш козырь
		for(let ci = 0; ci < this.deck.length; ci++){

			let thisCard = this.deck[ci];
			let otherCard = this.deck[this.deck.length - 1];
			if(thisCard.value != this.maxValue){
				this.deck[this.deck.length - 1] = thisCard;
				this.deck[ci] = otherCard;
				break;
			}
		}	

		// Запоминаем козырь
		let lastCard = this.deck[this.deck.length - 1];
		lastCard.field = 'BOTTOM';
		this.trumpSuit = lastCard.suit;
	}

	// Раздает карты пока у всех не по 6 карт или пока колода не закончится,
	// возвращает карты для отправки клиентам
	dealTillFullHand(){
		const game = this.game;
		const players = game.players;
		let originalAttackers = players.originalAttackers;
		let attackers = players.attackers;
		let defender = players.defender;
		let deals = [];

		let sequence = [];
		originalAttackers.forEach((p) => {
			if(!sequence.includes(p)){
				sequence.push(p);
			}
		});
		
		attackers.forEach((attacker) => {
			if(!sequence.includes(attacker)){
				sequence.push(attacker);
			}
		});

		if(!sequence.includes(defender)){
			sequence.push(defender);
		}

		sequence.forEach((player) => {
			let pid = player.id;
			let cardsInHand = this.hands[pid].length;
			if(cardsInHand < this.normalHandSize){
				let dealInfo = {
					pid: pid,
					numOfCards: this.normalHandSize - cardsInHand
				};
				deals.push(dealInfo);
			}
		});

		if(deals.length){
			return this.deal(deals);
		}
		else{
			return [];
		}
	}

	// Сбрасывает карты, возвращает карты для отправки клиентам
	discard(){

		let action = {
			type: 'DISCARD',
			ids: []
		};

		// Убираем карты со всех позиций на столе
		this.table.forEach((tableField) => {

			if(tableField.attack){
				let card = tableField.attack;
				this.game.actions.logAction(card, 'DISCARD', card.field, 'DISCARD_PILE');
				card.field = 'DISCARD_PILE';

				action.ids.push(tableField.attack.id);
				this.discardPile.push(tableField.attack);
				tableField.attack = null;
			}

			if(tableField.defense){
				let card = tableField.defense;
				this.game.actions.logAction(card, 'DISCARD', card.field, 'DISCARD_PILE');
				card.field = 'DISCARD_PILE';

				action.ids.push(tableField.defense.id);
				this.discardPile.push(tableField.defense);
				tableField.defense = null;
			}

		});

		// Если карты были убраны, оповещаем игроков и переходим в фазу раздачи карт игрокам
		if(action.ids.length){

			// После первого сброса на стол можно класть больше карт
			if(this.table.fullLength < this.table.maxLength){
				this.table.fullLength++;
				this.log.info('First discard, field expanded to', this.table.fullLength);
				action.unlockedField = 'TABLE' + (this.table.fullLength - 1);
			}

			return action;
		}

		// Иначе раздаем карты и переходим в фазу конца хода
		else{
			return null;
		}
	}

	// Действия
	
	getAttackActions(hand, actions){
		// Находим значения карт, которые можно подбрасывать
		let validValues = [];
		this.table.forEach((tableField) => {
			if(tableField.attack){
				let card = tableField.attack;
				validValues.push(card.value);
			}
			if(tableField.defense){
				let card = tableField.defense;
				validValues.push(card.value);
			}
		});

		if(!validValues.length){
			validValues = null; 
		}

		let emptyTable = this.firstEmptyTable;

		// Выбираем подходящие карты из руки атакующего и собираем из них возможные действия
		hand.forEach((card) => {
			let cid = card.id;
			if(!validValues || ~validValues.indexOf(card.value)){		
				this.table.forEach((tableField) => {	
					let action = {
						type: 'ATTACK',
						cid: cid,
						field: tableField.id,
						linkedField: emptyTable.id
					};
					actions.push(action);
				});
			}
		});
	}

	getDefenseActions(hand, actions, defenseFields){

		// Создаем список возможных действий защищающегося
		defenseFields.forEach((defenseField) => {
			let fid = defenseField.id;
			hand.forEach((card) => {
				let cid = card.id;
				let otherCard = defenseField.attack;

				// Карты той же масти и большего значения, либо козыри, если битая карта не козырь,
				// иначе - козырь большего значения
				if( 
					card.suit == this.trumpSuit && otherCard.suit != this.trumpSuit ||
					card.suit == otherCard.suit && card.value > otherCard.value
				){			
					let action = {
						type: 'DEFENSE',
						cid: cid,
						field: fid
					};
					actions.push(action);
				}
			});
		});
	}

	getTransferActions(hand, actions, defenseFields){
		// Узнаем, можно ли переводить
		let attackers = this.game.players.attackers;
		let canTransfer = 
			this.hands[
				attackers[1] && attackers[1].id || attackers[0].id
			].length > this.table.usedFields;

		let attackField = this.table[this.table.usedFields];

		if(!canTransfer || !attackField){
			return;
		}

		for(let fi = 0; fi < this.table.length; fi++){
			let tableField = this.table[fi];
			if(tableField.defense){
				canTransfer = false;
				break;
			}
		}

		if(!canTransfer){
			return;
		}

		let defenseActionFields = actions.map((action) => action.field);

		let emptyTable = this.firstEmptyTable;

		for(let di = 0; di < defenseFields.length; di++){
			for(let ci = 0; ci < hand.length; ci++){
				let card = hand[ci];
				let cid = card.id;
				let otherCard = defenseFields[di].attack;

				if(card.value != otherCard.value){
					continue;
				}

				// Все поля, которые уже не находятся в возможных действиях
				for(let fi = 0; fi < this.table.length; fi++){	
					let fid = this.table[fi].id;

					if(defenseActionFields.includes(fid)){
						continue;
					}

					let action = {
						type: 'ATTACK',
						cid: cid,
						field: fid,
						linkedField: emptyTable.id
					};
					actions.push(action);
				}
			}
		}
	}

	getDiscardAction(player){
		let pid = player.id;
		let cardsInfo = [];
		let actionType = 'TAKE';

		for(let fi = 0; fi < this.table.length; fi++){
			let tableField = this.table[fi];

			if(tableField.attack){

				let card = tableField.attack;
				this.game.actions.logAction(card, actionType, card.field, pid);
				card.field = pid;

				this.hands[pid].push(tableField.attack);
				tableField.attack = null;

				let cardToSend = {
					cid: card.id,
					suit: card.suit,
					value: card.value
				};

				cardsInfo.push(cardToSend);
			}

			if(tableField.defense){

				let card = tableField.defense;
				this.game.actions.logAction(card, actionType, card.field, pid);
				card.field = pid;

				this.hands[pid].push(tableField.defense);
				tableField.defense = null;

				let cardToSend = {
					cid: card.id,
					suit: card.suit,
					value: card.value
				};

				cardsInfo.push(cardToSend);
			}

		}
		return {
			type: actionType,
			cards: cardsInfo,
			pid: pid
		};
	}
}

module.exports = DurakCards;