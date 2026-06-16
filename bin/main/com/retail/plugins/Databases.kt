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
    val dbUrl = config.propertyOrNull("database.url")?.getString() ?: "jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:6543/postgres?ssl=true&sslmode=require&prepareThreshold=0"
    var dbUser = config.propertyOrNull("database.user")?.getString() ?: "postgres.nuqaqxkbrjkenbpmhgdt"
    if (!dbUser.contains(".")) {
        dbUser = "$dbUser.nuqaqxkbrjkenbpmhgdt"
    }
    var dbPassword = config.propertyOrNull("database.password")?.getString() ?: "Prodavalnik"
    if (dbPassword == "ВАШАТА_СУПАБЕЙС_ПАРОЛА") {
        dbPassword = "Prodavalnik"
    }

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
                it[name] = "Авточасти Експрес ООД"
                it[address] = "гр. София, бул. Сливница № 120"
            }
        } else {
            RetailStoreInfo.update({ RetailStoreInfo.id eq 1 }) {
                it[name] = "Авточасти Експрес ООД"
                it[address] = "гр. София, бул. Сливница № 120"
            }
        }

        // Seed suppliers and items if empty
        if (RetailItems.selectAll().count() == 0L) {
            log.info("Seeding default auto parts suppliers...")
            val s1 = RetailSuppliers.insert {
                it[name] = "Ауто Груп БГ ЕООД"
                it[address] = "гр. София, ул. Резбарска № 5"
                it[phone] = "+35928001000"
            } get RetailSuppliers.id

            val s2 = RetailSuppliers.insert {
                it[name] = "Елит Кар ООД"
                it[address] = "гр. Варна, бул. Владислав Варненчик № 260"
                it[phone] = "+35952500600"
            } get RetailSuppliers.id

            val s3 = RetailSuppliers.insert {
                it[name] = "Косер АД"
                it[address] = "гр. Пловдив, бул. Христо Ботев № 92"
                it[phone] = "+35932600700"
            } get RetailSuppliers.id

            log.info("Seeding default auto parts items...")
            val itemsData = listOf(
                Triple("Свещи NGK Laser Platinum", 28.50, "Budget" to "Запалителна система"),
                Triple("Ангренажен комплект Gates", 185.00, "Standard" to "Двигател"),
                Triple("Турбокомпресор Garrett GT1749V", 890.00, "Premium" to "Двигател"),
                Triple("Спирачни накладки Brembo (предни)", 65.00, "Standard" to "Спирачна система"),
                Triple("Спирачен диск ATE PowerDisc", 115.00, "Standard" to "Спирачна система"),
                Triple("Преден амортисьор Sachs", 95.00, "Standard" to "Ходова част"),
                Triple("Комплект носачи Lemforder", 520.00, "Premium" to "Ходова част"),
                Triple("Моторно масло Castrol Edge 5W-30 (5L)", 85.00, "Standard" to "Филтри и Масла"),
                Triple("Маслен филтър MANN-FILTER", 14.50, "Budget" to "Филтри и Масла")
            )

            val descriptions = mapOf(
                "Свещи NGK Laser Platinum" to "Висококачествени иридиеви запалителни свещи за оптимално изгаряне и икономия на гориво.",
                "Ангренажен комплект Gates" to "Пълен ангренажен комплект с ремък и ролки за европейски и японски автомобили.",
                "Турбокомпресор Garrett GT1749V" to "Оригинален турбокомпресор Garrett за дизелови двигатели 1.9 TDI.",
                "Спирачни накладки Brembo (предни)" to "Спирачни накладки Brembo с висока спирачна ефективност и устойчивост на топлина.",
                "Спирачен диск ATE PowerDisc" to "Спортен нарязан спирачен диск за по-добро отвеждане на газове и прах при спиране.",
                "Преден амортисьор Sachs" to "Немски амортисьор Sachs за стабилност и комфортно пътуване при всякакви пътни настилки.",
                "Комплект носачи Lemforder" to "Пълен ремонтен комплект за предно окачване с най-високо качество на изработка.",
                "Моторно масло Castrol Edge 5W-30 (5L)" to "Напълно синтетично моторно масло с технология Fluid TITANIUM за максимална защита на двигателя.",
                "Маслен филтър MANN-FILTER" to "Оригинален маслен филтър MANN за висока степен на пречистване и защита от износване."
            )

            val itemIds = mutableMapOf<String, Int>()

            for (item in itemsData) {
                val name = item.first
                val priceVal = item.second
                val itemClassVal = item.third.first
                val categoryVal = item.third.second
                val descVal = descriptions[name] ?: ""

                val idVal = RetailItems.insert {
                    it[RetailItems.name] = name
                    it[price] = priceVal
                    it[itemClass] = itemClassVal
                    it[category] = categoryVal
                    it[description] = descVal
                } get RetailItems.id
                itemIds[name] = idVal
            }

            log.info("Linking auto parts items to suppliers...")
            // Link NGK to s1, s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Свещи NGK Laser Platinum"]!!
                it[supplierId] = s1
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Свещи NGK Laser Platinum"]!!
                it[supplierId] = s3
            }

            // Link Gates to s2, s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Ангренажен комплект Gates"]!!
                it[supplierId] = s2
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Ангренажен комплект Gates"]!!
                it[supplierId] = s3
            }

            // Link Garrett to s1
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Турбокомпресор Garrett GT1749V"]!!
                it[supplierId] = s1
            }

            // Link Brembo to s1, s2
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Спирачни накладки Brembo (предни)"]!!
                it[supplierId] = s1
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Спирачни накладки Brembo (предни)"]!!
                it[supplierId] = s2
            }

            // Link ATE to s2
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Спирачен диск ATE PowerDisc"]!!
                it[supplierId] = s2
            }

            // Link Sachs to s2, s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Преден амортисьор Sachs"]!!
                it[supplierId] = s2
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Преден амортисьор Sachs"]!!
                it[supplierId] = s3
            }

            // Link Lemforder to s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Комплект носачи Lemforder"]!!
                it[supplierId] = s3
            }

            // Link Castrol to s1, s2, s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Моторно масло Castrol Edge 5W-30 (5L)"]!!
                it[supplierId] = s1
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Моторно масло Castrol Edge 5W-30 (5L)"]!!
                it[supplierId] = s2
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Моторно масло Castrol Edge 5W-30 (5L)"]!!
                it[supplierId] = s3
            }

            // Link MANN to s1, s3
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Маслен филтър MANN-FILTER"]!!
                it[supplierId] = s1
            }
            RetailItemSuppliers.insert {
                it[itemId] = itemIds["Маслен филтър MANN-FILTER"]!!
                it[supplierId] = s3
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
                it[accountNumber] = "BG91UNCR96601012345678"
            }
            RetailBankAccounts.insert {
                it[clientId] = clientProfileId
                it[bankName] = "Банка ДСК"
                it[accountNumber] = "BG80DSKB93001098765432"
            }
        }
    }
}
