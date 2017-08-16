/**
* Модуль, работающий с движком игры и инициализирующий все остальные модули
* @param {string} [parent] id DOM элемента, в который будет добавлен canvas элемент игры
* @param {number} [speed=1] скорость игры
* @param {number} [inDebugMode=false] находится ли игра в дебаг режиме
* @class
* @extends {Phaser.Game}
* @listens document.resize
* @listens document.orientationchange
* @listens document.visibilitychange
* @see {@link http://phaser.io/docs/2.6.2/Phaser.Game.html}
*/

var Game = function(parent, speed, inDebugMode){

	/**
	* Скорость игры.
	* @type {number}
	* @default 1
	*/
	this.speed = speed || 1;

	/**
	* Находится ли игры в дебаг режиме.
	* @type {boolean}
	* @default false
	*/
	this.inDebugMode = inDebugMode || false;

	/**
	* Инициализирована ли игра.
	* @type {Boolean}
	*/
	this.initialized = false;

	/**
	* Была ли игра остановлена из-за потери видимости окна.
	* @type {Boolean}
	*/
	this.pausedByViewChange = false;

	/**
	* Находится ли игра в горизонтальном положении, 
	* рассчитывается только по размеру экрана.
	* @type {Boolean}
	*/
	this.isRawLandscape = true;

	/**
	* Менеджер последовательностей игровых анимаций.
	* @type {Sequencer}
	*/
	this.seq = new Sequencer();

	Phaser.Game.call(
		this,
		{
			width: this.screenWidth,
 			height: this.screenHeight, 
			renderer: options.get('system_renderer'), 
			parent: parent,
			transparent: true
		}
	);

	this._dimensionsUpdateTimeout = null;
	this._hiddenValue = null;

};

extend(Game, Phaser.Game);

/**
* Инициализирет игру.
*/
Game.prototype.initialize = function(){

	// Устанавливаем размер игры
	this.scale.updateGameSize();

	// Отключаем контекстное меню
	this.canvas.oncontextmenu = function (e) {e.preventDefault();};

	// Добавляем листенеры
	this._addVisibilityChangeListener();
	window.addEventListener('resize', this._updateCoordinatesDebounce.bind(this));
	window.addEventListener('orientationchange', this._updateCoordinatesDebounce.bind(this));

	// Антиалиасинг
	// Phaser.Canvas.setImageRenderingCrisp(game.canvas);
	
	/**
	* Менеджер полей
	* @type {FieldManager}
	* @global
	*/
	fieldManager = new FieldManager(options.get('debug_fields'));

	/**
	* Менеджер карт
	* @type {CardManager}
	* @global
	*/
	cardManager = new CardManager(options.get('debug_connection'));

	/**
	* Эмиттер карт
	* @type {CardEmitter}
	* @global
	*/
	cardEmitter = new CardEmitter();

	// Инициализация модулей
	cardControl.initialize();
	ui.initialize();
	connection.initialize();

	/* Дебаг */
	this.scale.drawDebugGrid();

	this.onPause.add(function(){
		if(this.inDebugMode)
			console.log('Game: paused internally');
	}, this);

	this.onResume.add(function(){
		if(this.inDebugMode)
			console.log('Game: unpaused internally');
	}, this);
	/********/
	
	this.initialized = true;
};

/**
* Корректирует размеры игры в соответствии с размером окна.
*/
Game.prototype.updateCoordinates = function(){
	this.scale.updateGameSize();
	this.scale.drawDebugGrid();
	var state = this.state.getCurrent();
	state.postResize();
	this._dimensionsUpdateTimeout = null;
};

/**
* Применяет скин ко всем элементам игры
*/
Game.prototype.applySkin = function(){
	this.scale.updateGameSize();
	this.scale.drawDebugGrid();
	var state = this.state.getCurrent();
	state.applySkin();
};

/**
* Запускает дебаунс корректировки размеров игры.
* @private
*/
Game.prototype._updateCoordinatesDebounce = function(){
	if(this._dimensionsUpdateTimeout){
		clearTimeout(this._dimensionsUpdateTimeout);
	}
	else if(!this.scale.fullScreenModeChanged && !this.inDebugMode){
		document.getElementById('loading').style.display = 'block';
	}
	var timeout = (this.scale.fullScreenModeChanged || this.inDebugMode) ? 10 : 500;
	this._dimensionsUpdateTimeout = setTimeout(this.updateCoordinates.bind(this), timeout);
};

/** Остонавливает симуляцию. */
Game.prototype.pause = function(){
	this.paused = true;	
	this.pausedByViewChange = true;
	if(this.inDebugMode){
		console.log('Game: paused by visibility change');
	}
};

/** Запускает симуляцию. */
Game.prototype.unpause = function(){
	this.paused = false;
	this.pausedByViewChange = false;
	if(this.inDebugMode){
		console.log('Game: unpaused by visibility change');
	}

	var state = this.state.getCurrent();
	setTimeout(state.postResumed.bind(state), 1000);
};

/**
* Ставит и снимает игру с паузы в зависимости от видимости окна,
* корректирует элементы игры после снятия паузы.
* @private
*/
Game.prototype._visibilityChangeListener = function(){
	if (!document[this._hiddenValue]) {
		this.unpause();
	}
	else{
		this.pause();
	}
};

/**
* Добавляет листенер изменения видимости вкладки в зависимости от браузера.
* @private
*/
Game.prototype._addVisibilityChangeListener = function(){
	var visibilityChange; 
	if (typeof document.hidden !== "undefined") {
		this._hiddenValue = "hidden";
		visibilityChange = "visibilitychange";
	} else if (typeof document.msHidden !== "undefined") {
		this._hiddenValue = "msHidden";
		visibilityChange = "msvisibilitychange";
	} else if (typeof document.webkitHidden !== "undefined") {
		this._hiddenValue = "webkitHidden";
		visibilityChange = "webkitvisibilitychange";
	}
	document.addEventListener(visibilityChange, this._visibilityChangeListener.bind(this), false);
};

/** Переключает дебаг всех элементов игры. */
Game.prototype.toggleAllDebugModes = function(){

	this.toggleDebugMode();

	connection.inDebugMode = this.inDebugMode;
	options.set('debug_connection', this.inDebugMode);

	if(this.scale.inDebugMode != this.inDebugMode){
		this.scale.toggleDebugMode();
	}

	if(cardControl.inDebugMode != this.inDebugMode){
		cardControl.toggleDebugMode();
	}

	if(fieldManager.inDebugMode != this.inDebugMode){
		fieldManager.toggleDebugMode();
	}

	if(cardManager.inDebugMode != this.inDebugMode){
		cardManager.toggleDebugMode();	
	}
};

/** Переключает дебаг игры */
Game.prototype.toggleDebugMode = function(){
	this.inDebugMode = !this.inDebugMode;
	this.time.advancedTiming = this.inDebugMode;
	options.set('debug_game', this.inDebugMode);
	options.save();
};

/** Выводит состояние дебаг режима всех модулей. */
Game.prototype.checkDebugStatus = function(){
	console.log(
		'game:', this.inDebugMode,
		'\nconnection:', connection.inDebugMode,
		'\nscale:', this.scale.inDebugMode,
		'\ncardControl:', cardControl.inDebugMode,
		'\nfieldManager:', fieldManager.inDebugMode,
		'\ncardManager:', cardManager.inDebugMode
	);
};

/** Выводит FPS. */
Game.prototype.updateDebug = function(){
	if(!this.inDebugMode)
		return;
	this.debug.text(this.time.fps, 2, 14, "#00ff00");
};

/** Снимает игру с паузы, если она была поставлена на паузу по неверной причине. */
Game.prototype.fixPause = function(){
	if(this.stage.disableVisibilityChange && this.paused && !this.pausedByViewChange){
		this.paused = false;
		if(this.inDebugMode)
			console.log('Game: unpaused forced');
	}
};

//@include:GameOverride