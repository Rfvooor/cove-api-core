import { DataTypes, Model, Op } from 'sequelize';
import { mysqlConnection } from '../external/mysql';

interface BaseWithLastAccessed {
    id: number;
    lastAccessed: Date | null;
}

const BaseWithLastAccessedSchema = {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    lastAccessed: {
        type: DataTypes.DATE,
        allowNull: true
    }
};

interface BaseDiscord {
    channelId: number | null;
    guildId: number | null;
    userId: number | null;
}

const BaseDiscordSchema = {
    channelId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    }, 
    guildId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true,
    },
}

const DiscordTypeMapping: {[key: number]: string} = {
    0: 'channelId',
    1: 'guildId',
    2: 'userId'
};

interface BaseWithLastAccessedBigInt {
    id: bigint;
    lastAccessed: Date | null;
}

const BaseWithLastAccessedBigIntSchema = {
    id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true
    },
    lastAccessed: {
        type: DataTypes.DATE,
        allowNull: true
    }
};

const addLastAccessedHook = (model: any): void => {
    model.beforeCreate((record: any) => {
        record.lastAccessed = new Date();
    });
};

const updateLastAccessed = async (model: any, id: number): Promise<void> => {
    await model.update(
        { lastAccessed: new Date() },
        { 
            where: { 
                id: id,  
            } 
        }
    );
};

interface DiscordRef extends Model, BaseWithLastAccessed {
    discordId: string;
    type: number;
}

const DiscordRefs = mysqlConnection.define<DiscordRef>('DiscordRefs', {
    ...BaseWithLastAccessedSchema,
    discordId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
        type: DataTypes.SMALLINT,
        allowNull: false
    },
}, {
    indexes: [
        {
            unique: false,
            fields: ['discordId']
        }
    ]
});

interface BasePingAttributes extends BaseWithLastAccessed, BaseDiscord {
    addressRef: number;
    price: number;
}

const BasePingSchema = {
    ...BaseWithLastAccessedSchema,
    addressRef: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    price: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    ...BaseDiscordSchema
};

interface ChannelPing extends Model, BasePingAttributes {
    rank?: number;
    filterId?: number;
    pingStrength?: number;
}

const ChannelPings = mysqlConnection.define<ChannelPing>('ChannelPings', {
    ...BasePingSchema,
    rank: {
        type: DataTypes.SMALLINT,
        allowNull: true
    },
    filterId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    pingStrength: {
        type: DataTypes.SMALLINT,
        allowNull: true,
    }
}, {
    indexes: [
        {
            unique: false,
            fields: ['addressRef','createdAt', 'channelId', 'rank']
        },
        {
            unique: false,
            fields: ['addressRef','channelId']
        },
        {
            unique: false,
            fields: ['addressRef', 'filterId']
        }
    ]
});
addLastAccessedHook(ChannelPings);

interface Filter extends Model, BaseWithLastAccessed, BaseDiscord {
    name: string;
    filterFile: string;
    active: boolean;
}

const Filters = mysqlConnection.define<Filter>('Filters', {
    ...BaseWithLastAccessedSchema,
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    filterFile: {
        type: DataTypes.STRING,
        allowNull: false
    },
    active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    ...BaseDiscordSchema
    
});
addLastAccessedHook(Filters);

interface Strategy extends Model, BaseWithLastAccessed, BaseDiscord {
    strategyId: number;
    name: string;
    strategyFile: string;
}

const Strategies = mysqlConnection.define<Strategy>('Strategies', {
    ...BaseWithLastAccessedSchema,
    strategyId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    strategyFile: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ...BaseDiscordSchema
});
addLastAccessedHook(Strategies);

interface Swap extends Model, BaseWithLastAccessed {
    swapTime: Date;
    swapAmountIn: number;
    swapAmountOut: number;
    tokenRefIn: number;
    tokenRefOut: number;
    addressRef: number;
}

const Swaps = mysqlConnection.define<Swap>('Swaps', {
    ...BaseWithLastAccessedSchema,
    swapTime: {
        type: DataTypes.DATE,
        allowNull: false
    },
    swapAmountIn: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    swapAmountOut: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    tokenRefIn: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tokenRefOut: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    addressRef: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});
addLastAccessedHook(Swaps);

interface Trade extends Model, BaseWithLastAccessed {
    tradePnl?: number;
    swaps: number[];
    addressRef: number;
    typeId: number;
}

const Trades = mysqlConnection.define<Trade>('Trades', {
    ...BaseWithLastAccessedSchema,
    tradePnl: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    swaps: {
        type: DataTypes.JSON,
        allowNull: false
    },
    addressRef: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    typeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});
addLastAccessedHook(Trades);

interface TradeType extends Model, BaseWithLastAccessed {
    tradeTypeId: number;
    tradeType: string;
}

const TradeTypes = mysqlConnection.define<TradeType>('TradeTypes', {
    ...BaseWithLastAccessedSchema,
    tradeTypeId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    tradeType: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

interface AddressTag extends Model, BaseWithLastAccessed {
    tagId: number;
    addressRef: number;
}

const AddressTags = mysqlConnection.define<AddressTag>('AddressTags', {
    ...BaseWithLastAccessedSchema,
    tagId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    addressRef: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

interface Tag extends Model {
    tagId: number;
    tag: string;
}

const Tags = mysqlConnection.define<Tag>('Tags', {
    tagId: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    tag: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

interface AddressAttributes extends BaseWithLastAccessedBigInt {
    address: string;
}

const AddressesSchema = {
    ...BaseWithLastAccessedBigIntSchema,
    address: {
        type: DataTypes.STRING(44),
        allowNull: false,
        unique: true,
    }
};

interface Token extends Model, AddressAttributes {
    tokenSupply?: bigint;
    tokenName?: string;
    tokenSymbol?: string;
    holders?: number;
    bundleAmt?: bigint;
    confidenceScore: number;
    bonded: boolean;
}

const Tokens = mysqlConnection.define<Token>('Tokens', {
    ...AddressesSchema,
    tokenSupply: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    tokenName: {
        type: DataTypes.STRING,
        allowNull: true
    },
    tokenSymbol: {
        type: DataTypes.STRING,
        allowNull: true
    },
    holders: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    bundleAmt: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    confidenceScore: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    bonded: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['id','address'],
        }
    ]
});
addLastAccessedHook(Tokens);

interface Wallet extends Model, AddressAttributes {
    txnCount?: number;
    lastUpdated: Date;
    usdValue?: number;
}

const Wallets = mysqlConnection.define<Wallet>('Wallets', {
    ...AddressesSchema,
    txnCount: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    lastUpdated: {
        type: DataTypes.DATE,
        allowNull: false
    },
    usdValue: {
        type: DataTypes.INTEGER,
        allowNull: true
    }
},
{
    indexes: [
        {
            unique: true,
            fields: ['id','address'],
        }
    ]
});
addLastAccessedHook(Wallets);

const User = mysqlConnection.define('User', {
    walletId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        primaryKey: true
    },
    telegramId: {
        type: DataTypes.STRING,
        allowNull: true
    }, 
    creditBalance: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    }, 
});


export {
    Filters,
    Strategies,
    Swaps,
    Trades,
    TradeTypes,
    Wallets,
    AddressTags,
    Tags,
    Tokens,
    ChannelPings,
    DiscordRefs,
    User,
    updateLastAccessed,
    DiscordTypeMapping
};
