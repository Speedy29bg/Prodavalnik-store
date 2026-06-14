package com.retail.plugins

import io.ktor.server.application.*
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.SchemaUtils
import org.mindrot.jbcrypt.BCrypt
import com.retail.models.*

fun Application.configureDatabases() {
    val config = environment.config
    
    val driverClass = config.propertyOrNull("database.driver")?.getString() ?: "org.postgresql.Driver"
    val dbUrl = config.propertyOrNull("database.url")?.getString() ?: "jdbc:postgresql://db.ziqkxgsdjvtiijeonfpt.supabase.co:5432/postgres?ssl=true&sslmode=require"
    val dbUser = config.propertyOrNull("database.user")?.getString() ?: "retail_app_user"
    val dbPassword = config.propertyOrNull("database.password")?.getString() ?: "RetailApp2026Password!"

    log.info("Connecting to Supabase Database...")
    
    val hikariConfig = HikariConfig().apply {
        driverClassName = driverClass
        jdbcUrl = dbUrl
        username = dbUser
        password = dbPassword
        maximumPoolSize = 3
        isAutoCommit = false
        transactionIsolation = "TRANSACTION_REPEATABLE_READ"
        validate()
    }
    
    val dataSource = HikariDataSource(hikariConfig)
    Database.connect(dataSource)

    // Execute migrations / schema setup inside a transaction
    transaction {
        // Enable SQL logging to console
        addLogger(StdOutSqlLogger)
        
        log.info("Initializing database tables...")
        SchemaUtils.create(
            RetailUsers,
            RetailStoreInfo,
            RetailClients,
            RetailBankAccounts,
            RetailSuppliers,
            RetailItems,
            RetailItemSuppliers,
            RetailPromotions,
            RetailPromotionItems,
            RetailOrders,
            RetailOrderItems
        )
        
        // Seed default store information if empty
        if (RetailStoreInfo.selectAll().count() == 0L) {
            log.info("Seeding default store information...")
            RetailStoreInfo.insert {
                it[id] = 1
                it[name] = "Мини Маркет ЕООД"
                it[address] = "гр. София, ул. Алабин № 15"
            }
        }
        
        // Seed default users if empty
        if (RetailUsers.selectAll().count() == 0L) {
            log.info("Seeding default users (admin, moderator, client)...")
            
            // 1. Admin
            val adminId = RetailUsers.insert {
                it[username] = "admin"
                it[passwordHash] = BCrypt.hashpw("admin123", BCrypt.gensalt())
                it[role] = "admin"
            } get RetailUsers.id

            // 2. Moderator
            val modId = RetailUsers.insert {
                it[username] = "moderator"
                it[passwordHash] = BCrypt.hashpw("mod123", BCrypt.gensalt())
                it[role] = "moderator"
            } get RetailUsers.id

            // 3. Client
            val clientIdUser = RetailUsers.insert {
                it[username] = "client"
                it[passwordHash] = BCrypt.hashpw("client123", BCrypt.gensalt())
                it[role] = "client"
            } get RetailUsers.id

            // Create client profile for the client user
            val clientProfileId = RetailClients.insert {
                it[userId] = clientIdUser
                it[clientNumber] = "CL-10001"
                it[firstName] = "Иван"
                it[lastName] = "Иванов"
            } get RetailClients.id

            // Create default bank accounts for the client
            RetailBankAccounts.insert {
                it[clientId] = clientProfileId
                it[bankName] = "УниКредит Булбанк"
                it[accountNumber] = "BG95UNCR96601012345678"
            }
            RetailBankAccounts.insert {
                it[clientId] = clientProfileId
                it[bankName] = "Банка ДСК"
                it[accountNumber] = "BG54DSKB93001098765432"
            }
        }
    }
}
