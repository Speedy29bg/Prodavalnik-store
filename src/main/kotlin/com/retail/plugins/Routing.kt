package com.retail.plugins

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.request.*
import io.ktor.http.*
import io.ktor.server.sessions.*
import io.ktor.server.http.content.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import org.mindrot.jbcrypt.BCrypt
import com.retail.models.*

@kotlinx.serialization.Serializable
data class LoginRequest(val username: String, val passwordHash: String)

fun Application.configureRouting() {
    routing {
        // Serve static SPA files
        staticResources("/", "static")
        
        route("/api") {
            // --- Authentication ---
            route("/auth") {
                post("/login") {
                    val req = call.receive<LoginRequest>()
                    val user = transaction {
                        RetailUsers.select { RetailUsers.username eq req.username }.singleOrNull()
                    }
                    
                    if (user != null && BCrypt.checkpw(req.passwordHash, user[RetailUsers.passwordHash])) {
                        val session = UserSession(
                            userId = user[RetailUsers.id],
                            username = user[RetailUsers.username],
                            role = user[RetailUsers.role]
                        )
                        call.sessions.set(session)
                        call.respond(HttpStatusCode.OK, UserDTO(
                            id = user[RetailUsers.id],
                            username = user[RetailUsers.username],
                            role = user[RetailUsers.role]
                        ))
                    } else {
                        call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно потребителско име или парола"))
                    }
                }
                
                post("/logout") {
                    call.sessions.clear<UserSession>()
                    call.respond(HttpStatusCode.OK, mapOf("message" to "Успешно излизане"))
                }
                
                post("/register") {
                    val req = call.receive<ClientRegisterRequest>()
                    if (req.username.isBlank() || req.passwordHash.isBlank() || req.firstName.isBlank() || req.lastName.isBlank()) {
                        return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Всички полета са задължителни"))
                    }
                    
                    val usernameExists = transaction {
                        RetailUsers.select { RetailUsers.username eq req.username }.count() > 0
                    }
                    if (usernameExists) {
                        return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Потребителското име вече е заето"))
                    }
                    
                    try {
                        transaction {
                            val uId = RetailUsers.insert {
                                it[username] = req.username
                                it[passwordHash] = BCrypt.hashpw(req.passwordHash, BCrypt.gensalt())
                                it[role] = "client"
                            } get RetailUsers.id
                            
                            val clientCount = RetailClients.selectAll().count()
                            val clientNum = "CL-${10001 + clientCount}"
                            
                            val cId = RetailClients.insert {
                                it[userId] = uId
                                it[clientNumber] = clientNum
                                it[firstName] = req.firstName
                                it[lastName] = req.lastName
                            } get RetailClients.id
                            
                            for (acc in req.bankAccounts) {
                                if (acc.bankName.isNotBlank() && acc.accountNumber.isNotBlank()) {
                                    RetailBankAccounts.insert {
                                        it[clientId] = cId
                                        it[bankName] = acc.bankName
                                        it[accountNumber] = acc.accountNumber
                                    }
                                }
                            }
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Успешна регистрация"))
                    } catch (e: Exception) {
                        call.respond(HttpStatusCode.InternalServerError, mapOf("error" to "Възникна грешка при базата данни: ${e.message}"))
                    }
                }
                
                get("/me") {
                    val session = call.sessions.get<UserSession>()
                    if (session == null) {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Не сте влезли"))
                        return@get
                    }
                    
                    val clientInfo = if (session.role == "client") {
                        transaction {
                            val client = RetailClients.select { RetailClients.userId eq session.userId }.singleOrNull()
                            if (client != null) {
                                val cId = client[RetailClients.id]
                                val bankAccounts = RetailBankAccounts.select { RetailBankAccounts.clientId eq cId }.map {
                                    BankAccountDTO(
                                        id = it[RetailBankAccounts.id],
                                        clientId = it[RetailBankAccounts.clientId],
                                        bankName = it[RetailBankAccounts.bankName],
                                        accountNumber = it[RetailBankAccounts.accountNumber]
                                    )
                                }
                                ClientDTO(
                                    id = client[RetailClients.id],
                                    userId = client[RetailClients.userId],
                                    clientNumber = client[RetailClients.clientNumber],
                                    firstName = client[RetailClients.firstName],
                                    lastName = client[RetailClients.lastName],
                                    username = session.username,
                                    bankAccounts = bankAccounts
                                )
                            } else null
                        }
                    } else null
                    
                    call.respond(HttpStatusCode.OK, mapOf(
                        "user" to UserDTO(session.userId, session.username, session.role),
                        "client" to clientInfo
                    ))
                }
            }
            
            // --- Store Information ---
            route("/store") {
                get {
                    val store = transaction {
                        RetailStoreInfo.selectAll().firstOrNull()
                    }
                    if (store != null) {
                        call.respond(HttpStatusCode.OK, StoreInfoDTO(
                            name = store[RetailStoreInfo.name],
                            address = store[RetailStoreInfo.address]
                        ))
                    } else {
                        call.respond(HttpStatusCode.NotFound, mapOf("error" to "Няма информация за магазина"))
                    }
                }
                
                withRole("admin", "moderator") {
                    put {
                        val req = call.receive<StoreInfoUpdateRequest>()
                        if (req.name.isBlank() || req.address.isBlank()) {
                            return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Името и адресът са задължителни"))
                        }
                        
                        transaction {
                            RetailStoreInfo.update({ RetailStoreInfo.id eq 1 }) {
                                it[name] = req.name
                                it[address] = req.address
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Информацията за магазина е обновена"))
                    }
                }
            }
            
            // --- Users Management (Admin Only) ---
            withRole("admin") {
                route("/users") {
                    get {
                        val users = transaction {
                            RetailUsers.selectAll().map {
                                UserDTO(it[RetailUsers.id], it[RetailUsers.username], it[RetailUsers.role])
                            }
                        }
                        call.respond(HttpStatusCode.OK, users)
                    }
                    
                    post {
                        val req = call.receive<UserCreateRequest>()
                        if (req.username.isBlank() || req.passwordHash.isBlank() || req.role !in listOf("admin", "moderator", "client")) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидни данни за потребител"))
                        }
                        
                        val usernameExists = transaction {
                            RetailUsers.select { RetailUsers.username eq req.username }.count() > 0
                        }
                        if (usernameExists) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Потребителското име вече е заето"))
                        }
                        
                        transaction {
                            RetailUsers.insert {
                                it[username] = req.username
                                it[passwordHash] = BCrypt.hashpw(req.passwordHash, BCrypt.gensalt())
                                it[role] = req.role
                            }
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Потребителят е създаден успешно"))
                    }
                    
                    put("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val req = call.receive<UserCreateRequest>()
                        
                        transaction {
                            RetailUsers.update({ RetailUsers.id eq id }) {
                                it[role] = req.role
                                if (req.passwordHash.isNotBlank()) {
                                    it[passwordHash] = BCrypt.hashpw(req.passwordHash, BCrypt.gensalt())
                                }
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Потребителят е обновен успешно"))
                    }
                    
                    delete("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        transaction {
                            // Don't delete last admin
                            val user = RetailUsers.select { RetailUsers.id eq id }.singleOrNull()
                            if (user != null && user[RetailUsers.role] == "admin") {
                                val adminCount = RetailUsers.select { RetailUsers.role eq "admin" }.count()
                                if (adminCount <= 1) {
                                    throw IllegalArgumentException("Не може да изтриете единствения администратор")
                                }
                            }
                            
                            // Delete related profiles, orders etc. is handled gracefully
                            // For simplicity, we just delete the user.
                            RetailUsers.deleteWhere { RetailUsers.id eq id }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Потребителят е изтрит"))
                    }
                }
            }
            
            // --- Clients CRUD (Admin / Moderator can list and register, client can manage bank accounts) ---
            route("/clients") {
                withRole("admin", "moderator") {
                    get {
                        val clients = transaction {
                            RetailClients.selectAll().map { client ->
                                val u = RetailUsers.select { RetailUsers.id eq client[RetailClients.userId] }.singleOrNull()
                                val cId = client[RetailClients.id]
                                val bankAccounts = RetailBankAccounts.select { RetailBankAccounts.clientId eq cId }.map {
                                    BankAccountDTO(
                                        id = it[RetailBankAccounts.id],
                                        clientId = it[RetailBankAccounts.clientId],
                                        bankName = it[RetailBankAccounts.bankName],
                                        accountNumber = it[RetailBankAccounts.accountNumber]
                                    )
                                }
                                ClientDTO(
                                    id = client[RetailClients.id],
                                    userId = client[RetailClients.userId],
                                    clientNumber = client[RetailClients.clientNumber],
                                    firstName = client[RetailClients.firstName],
                                    lastName = client[RetailClients.lastName],
                                    username = u?.get(RetailUsers.username),
                                    bankAccounts = bankAccounts
                                )
                            }
                        }
                        call.respond(HttpStatusCode.OK, clients)
                    }
                    
                    post {
                        val req = call.receive<ClientRegisterRequest>()
                        if (req.username.isBlank() || req.passwordHash.isBlank() || req.firstName.isBlank() || req.lastName.isBlank()) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидни данни за регистрация на клиент"))
                        }
                        
                        val usernameExists = transaction {
                            RetailUsers.select { RetailUsers.username eq req.username }.count() > 0
                        }
                        if (usernameExists) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Потребителското име е заето"))
                        }
                        
                        transaction {
                            val uId = RetailUsers.insert {
                                it[username] = req.username
                                it[passwordHash] = BCrypt.hashpw(req.passwordHash, BCrypt.gensalt())
                                it[role] = "client"
                            } get RetailUsers.id
                            
                            val clientCount = RetailClients.selectAll().count()
                            val clientNum = "CL-${10001 + clientCount}"
                            
                            val cId = RetailClients.insert {
                                it[userId] = uId
                                it[clientNumber] = clientNum
                                it[firstName] = req.firstName
                                it[lastName] = req.lastName
                            } get RetailClients.id
                            
                            for (acc in req.bankAccounts) {
                                if (acc.bankName.isNotBlank() && acc.accountNumber.isNotBlank()) {
                                    RetailBankAccounts.insert {
                                        it[clientId] = cId
                                        it[bankName] = acc.bankName
                                        it[accountNumber] = acc.accountNumber
                                    }
                                }
                            }
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Клиентът е регистриран успешно"))
                    }
                    
                    put("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val req = call.receive<ClientRegisterRequest>()
                        
                        transaction {
                            val client = RetailClients.select { RetailClients.id eq id }.singleOrNull() ?: return@transaction
                            RetailClients.update({ RetailClients.id eq id }) {
                                it[firstName] = req.firstName
                                it[lastName] = req.lastName
                            }
                            
                            if (req.passwordHash.isNotBlank()) {
                                RetailUsers.update({ RetailUsers.id eq client[RetailClients.userId] }) {
                                    it[passwordHash] = BCrypt.hashpw(req.passwordHash, BCrypt.gensalt())
                                }
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Данните на клиента са обновени"))
                    }
                    
                    delete("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        transaction {
                            val client = RetailClients.select { RetailClients.id eq id }.singleOrNull()
                            if (client != null) {
                                val uId = client[RetailClients.userId]
                                RetailBankAccounts.deleteWhere { RetailBankAccounts.clientId eq id }
                                RetailClients.deleteWhere { RetailClients.id eq id }
                                RetailUsers.deleteWhere { RetailUsers.id eq uId }
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Клиентът е изтрит"))
                    }
                }
                
                // Client managing bank accounts
                withRole("client", "admin", "moderator") {
                    post("/{id}/bank-accounts") {
                        val clientId = call.parameters["id"]?.toIntOrNull() ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID на клиент"))
                        val req = call.receive<BankAccountRequest>()
                        
                        if (req.bankName.isBlank() || req.accountNumber.isBlank()) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Името на банката и номерът на сметката са задължителни"))
                        }
                        
                        // Security check: Client can only modify their own bank accounts
                        val session = call.sessions.get<UserSession>()!!
                        if (session.role == "client") {
                            val ownsProfile = transaction {
                                RetailClients.select { (RetailClients.id eq clientId) and (RetailClients.userId eq session.userId) }.count() > 0
                            }
                            if (!ownsProfile) {
                                return@post call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Нямате достъп до този профил"))
                            }
                        }
                        
                        val accId = transaction {
                            RetailBankAccounts.insert {
                                it[RetailBankAccounts.clientId] = clientId
                                it[bankName] = req.bankName
                                it[accountNumber] = req.accountNumber
                            } get RetailBankAccounts.id
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Банковата сметка е добавена", "id" to accId))
                    }
                    
                    delete("/{clientId}/bank-accounts/{accId}") {
                        val clientId = call.parameters["clientId"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val accId = call.parameters["accId"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        val session = call.sessions.get<UserSession>()!!
                        if (session.role == "client") {
                            val ownsProfile = transaction {
                                RetailClients.select { (RetailClients.id eq clientId) and (RetailClients.userId eq session.userId) }.count() > 0
                            }
                            if (!ownsProfile) {
                                return@delete call.respond(HttpStatusCode.Forbidden, mapOf("error" to "Нямате достъп до този профил"))
                            }
                        }
                        
                        transaction {
                            RetailBankAccounts.deleteWhere { (RetailBankAccounts.id eq accId) and (RetailBankAccounts.clientId eq clientId) }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Банковата сметка е изтрита"))
                    }
                }
            }
            
            // --- Suppliers CRUD (Admin / Moderator) ---
            route("/suppliers") {
                get {
                    val suppliers = transaction {
                        RetailSuppliers.selectAll().map {
                            SupplierDTO(it[RetailSuppliers.id], it[RetailSuppliers.name], it[RetailSuppliers.address], it[RetailSuppliers.phone])
                        }
                    }
                    call.respond(HttpStatusCode.OK, suppliers)
                }
                
                withRole("admin", "moderator") {
                    post {
                        val req = call.receive<SupplierCreateRequest>()
                        if (req.name.isBlank() || req.address.isBlank()) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Името и адресът са задължителни"))
                        }
                        
                        transaction {
                            RetailSuppliers.insert {
                                it[name] = req.name
                                it[address] = req.address
                                it[phone] = req.phone
                            }
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Доставчикът е добавен успешно"))
                    }
                    
                    put("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val req = call.receive<SupplierCreateRequest>()
                        
                        transaction {
                            RetailSuppliers.update({ RetailSuppliers.id eq id }) {
                                it[name] = req.name
                                it[address] = req.address
                                it[phone] = req.phone
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Доставчикът е обновен"))
                    }
                    
                    delete("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        transaction {
                            RetailItemSuppliers.deleteWhere { RetailItemSuppliers.supplierId eq id }
                            RetailSuppliers.deleteWhere { RetailSuppliers.id eq id }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Доставчикът е изтрит"))
                    }
                }
            }
            
            // --- Items CRUD (View for all, CRUD for Admin / Moderator) ---
            route("/items") {
                get {
                    val items = transaction {
                        RetailItems.selectAll().map { item ->
                            val itemId = item[RetailItems.id]
                            val supplierIds = RetailItemSuppliers.select { RetailItemSuppliers.itemId eq itemId }.map {
                                it[RetailItemSuppliers.supplierId]
                            }
                            ItemDTO(
                                id = item[RetailItems.id],
                                name = item[RetailItems.name],
                                price = item[RetailItems.price],
                                itemClass = item[RetailItems.itemClass],
                                category = item[RetailItems.category],
                                description = item[RetailItems.description],
                                supplierIds = supplierIds
                            )
                        }
                    }
                    call.respond(HttpStatusCode.OK, items)
                }
                
                withRole("admin", "moderator") {
                    post {
                        val req = call.receive<ItemCreateRequest>()
                        if (req.name.isBlank() || req.price <= 0) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно име или цена"))
                        }
                        
                        // Auto-calculate item class based on price
                        val priceClass = when {
                            req.price <= 50.0 -> "Budget"
                            req.price <= 200.0 -> "Standard"
                            else -> "Premium"
                        }
                        
                        transaction {
                            val itemId = RetailItems.insert {
                                it[name] = req.name
                                it[price] = req.price
                                it[itemClass] = priceClass
                                it[category] = req.category
                                it[description] = req.description
                            } get RetailItems.id
                            
                            for (supId in req.supplierIds) {
                                RetailItemSuppliers.insert {
                                    it[RetailItemSuppliers.itemId] = itemId
                                    it[supplierId] = supId
                                }
                            }
                        }
                        call.respond(HttpStatusCode.Created, mapOf("message" to "Артикулът е добавен успешно"))
                    }
                    
                    put("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val req = call.receive<ItemCreateRequest>()
                        
                        val priceClass = when {
                            req.price <= 50.0 -> "Budget"
                            req.price <= 200.0 -> "Standard"
                            else -> "Premium"
                        }
                        
                        transaction {
                            RetailItems.update({ RetailItems.id eq id }) {
                                it[name] = req.name
                                it[price] = req.price
                                it[itemClass] = priceClass
                                it[category] = req.category
                                it[description] = req.description
                            }
                            
                            RetailItemSuppliers.deleteWhere { RetailItemSuppliers.itemId eq id }
                            for (supId in req.supplierIds) {
                                RetailItemSuppliers.insert {
                                    it[RetailItemSuppliers.itemId] = id
                                    it[supplierId] = supId
                                }
                            }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Артикулът е обновен"))
                    }
                    
                    delete("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        transaction {
                            RetailPromotionItems.deleteWhere { RetailPromotionItems.itemId eq id }
                            RetailItemSuppliers.deleteWhere { RetailItemSuppliers.itemId eq id }
                            RetailOrderItems.deleteWhere { RetailOrderItems.itemId eq id }
                            RetailItems.deleteWhere { RetailItems.id eq id }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Артикулът е изтрит"))
                    }
                }
            }
            
            // --- Promotions CRUD (Admin / Moderator) ---
            route("/promotions") {
                get {
                    val promotions = transaction {
                        RetailPromotions.selectAll().map { promo ->
                            val promoId = promo[RetailPromotions.id]
                            val itemIds = RetailPromotionItems.select { RetailPromotionItems.promotionId eq promoId }.map {
                                it[RetailPromotionItems.itemId]
                            }
                            PromotionDTO(
                                id = promo[RetailPromotions.id],
                                name = promo[RetailPromotions.name],
                                discountPercent = promo[RetailPromotions.discountPercent],
                                startDate = promo[RetailPromotions.startDate].toString(),
                                endDate = promo[RetailPromotions.endDate].toString(),
                                itemIds = itemIds
                            )
                        }
                    }
                    call.respond(HttpStatusCode.OK, promotions)
                }
                
                withRole("admin", "moderator") {
                    post {
                        val req = call.receive<PromotionCreateRequest>()
                        if (req.name.isBlank() || req.discountPercent <= 0) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно име или процент отстъпка"))
                        }
                        
                        try {
                            val formatter = DateTimeFormatter.ISO_LOCAL_DATE_TIME
                            val start = LocalDateTime.parse(req.startDate)
                            val end = LocalDateTime.parse(req.endDate)
                            
                            transaction {
                                val promoId = RetailPromotions.insert {
                                    it[name] = req.name
                                    it[discountPercent] = req.discountPercent
                                    it[startDate] = start
                                    it[endDate] = end
                                } get RetailPromotions.id
                                
                                for (itemId in req.itemIds) {
                                    RetailPromotionItems.insert {
                                        it[RetailPromotionItems.promotionId] = promoId
                                        it[RetailPromotionItems.itemId] = itemId
                                    }
                                }
                            }
                            call.respond(HttpStatusCode.Created, mapOf("message" to "Промоцията е добавена успешно"))
                        } catch (e: Exception) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалиден формат на дата: ${e.message}"))
                        }
                    }
                    
                    put("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        val req = call.receive<PromotionCreateRequest>()
                        
                        try {
                            val start = LocalDateTime.parse(req.startDate)
                            val end = LocalDateTime.parse(req.endDate)
                            
                            transaction {
                                RetailPromotions.update({ RetailPromotions.id eq id }) {
                                    it[name] = req.name
                                    it[discountPercent] = req.discountPercent
                                    it[startDate] = start
                                    it[endDate] = end
                                }
                                
                                RetailPromotionItems.deleteWhere { RetailPromotionItems.promotionId eq id }
                                for (itemId in req.itemIds) {
                                    RetailPromotionItems.insert {
                                        it[RetailPromotionItems.promotionId] = id
                                        it[RetailPromotionItems.itemId] = itemId
                                    }
                                }
                            }
                            call.respond(HttpStatusCode.OK, mapOf("message" to "Промоцията е обновена"))
                        } catch (e: Exception) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалиден формат на дата: ${e.message}"))
                        }
                    }
                    
                    delete("/{id}") {
                        val id = call.parameters["id"]?.toIntOrNull() ?: return@delete call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидно ID"))
                        
                        transaction {
                            RetailPromotionItems.deleteWhere { RetailPromotionItems.promotionId eq id }
                            RetailPromotions.deleteWhere { RetailPromotions.id eq id }
                        }
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Промоцията е изтрита"))
                    }
                }
            }
            
            // --- Orders & Checkout (All logged in users can view theirs, Clients can checkout, Admins/Mods see all) ---
            route("/orders") {
                withRole("client", "admin", "moderator") {
                    get {
                        val session = call.sessions.get<UserSession>()!!
                        val orders = transaction {
                            val clientQuery = if (session.role == "client") {
                                val clientProfile = RetailClients.select { RetailClients.userId eq session.userId }.singleOrNull()
                                val clientId = clientProfile?.get(RetailClients.id) ?: -1
                                RetailOrders.select { RetailOrders.clientId eq clientId }
                            } else {
                                RetailOrders.selectAll()
                            }
                            
                            clientQuery.orderBy(RetailOrders.orderDate to SortOrder.DESC).map { order ->
                                val oId = order[RetailOrders.id]
                                val items = RetailOrderItems.select { RetailOrderItems.orderId eq oId }.map { item ->
                                    val itemDetails = RetailItems.select { RetailItems.id eq item[RetailOrderItems.itemId] }.singleOrNull()
                                    OrderItemDTO(
                                        id = item[RetailOrderItems.id],
                                        itemId = item[RetailOrderItems.itemId],
                                        name = itemDetails?.get(RetailItems.name),
                                        quantity = item[RetailOrderItems.quantity],
                                        unitPrice = item[RetailOrderItems.unitPrice],
                                        discountAmount = item[RetailOrderItems.discountAmount],
                                        finalPrice = item[RetailOrderItems.finalPrice]
                                    )
                                }
                                OrderDTO(
                                    id = order[RetailOrders.id],
                                    clientId = order[RetailOrders.clientId],
                                    bankAccountId = order[RetailOrders.bankAccountId],
                                    totalAmount = order[RetailOrders.totalAmount],
                                    orderDate = order[RetailOrders.orderDate].toString(),
                                    status = order[RetailOrders.status],
                                    items = items
                                )
                            }
                        }
                        call.respond(HttpStatusCode.OK, orders)
                    }
                }
                
                withRole("client") {
                    post("/checkout") {
                        val session = call.sessions.get<UserSession>()!!
                        val req = call.receive<OrderCreateRequest>()
                        
                        if (req.items.isEmpty()) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Пазарската количка е празна"))
                        }
                        
                        val clientProfile = transaction {
                            RetailClients.select { RetailClients.userId eq session.userId }.singleOrNull()
                        }
                        if (clientProfile == null) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Не е намерен клиентски профил за този потребител"))
                        }
                        
                        val cId = clientProfile[RetailClients.id]
                        
                        // Validate bank account belongs to client
                        val validBank = transaction {
                            RetailBankAccounts.select {
                                (RetailBankAccounts.id eq req.bankAccountId) and (RetailBankAccounts.clientId eq cId)
                            }.count() > 0
                        }
                        if (!validBank) {
                            return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Невалидна банкова сметка за плащане"))
                        }
                        
                        try {
                            val now = LocalDateTime.now()
                            val generatedInvoice = transaction {
                                var grandTotal = 0.0
                                
                                val orderId = RetailOrders.insert {
                                    it[clientId] = cId
                                    it[bankAccountId] = req.bankAccountId
                                    it[totalAmount] = 0.0 // updated later
                                    it[orderDate] = now
                                    it[status] = "paid"
                                } get RetailOrders.id
                                
                                val responseItems = mutableListOf<OrderItemDTO>()
                                
                                for (reqItem in req.items) {
                                    val dbItem = RetailItems.select { RetailItems.id eq reqItem.itemId }.singleOrNull()
                                        ?: throw IllegalArgumentException("Артикул с ID ${reqItem.itemId} не съществува")
                                    
                                    val price = dbItem[RetailItems.price]
                                    
                                    // Check active promotion for this item
                                    val activePromo = (RetailPromotions innerJoin RetailPromotionItems)
                                        .select {
                                            (RetailPromotionItems.itemId eq reqItem.itemId) and
                                            (RetailPromotions.startDate lessEq now) and
                                            (RetailPromotions.endDate greaterEq now)
                                        }
                                        .orderBy(RetailPromotions.discountPercent to SortOrder.DESC)
                                        .limit(1)
                                        .singleOrNull()
                                        
                                    val discountPercent = activePromo?.get(RetailPromotions.discountPercent) ?: 0.0
                                    val discountAmount = (price * (discountPercent / 100.0)) * reqItem.quantity
                                    val finalPrice = (price * reqItem.quantity) - discountAmount
                                    
                                    grandTotal += finalPrice
                                    
                                    val orderItemId = RetailOrderItems.insert {
                                        it[RetailOrderItems.orderId] = orderId
                                        it[itemId] = reqItem.itemId
                                        it[quantity] = reqItem.quantity
                                        it[unitPrice] = price
                                        it[RetailOrderItems.discountAmount] = discountAmount
                                        it[RetailOrderItems.finalPrice] = finalPrice
                                    } get RetailOrderItems.id
                                    
                                    responseItems.add(OrderItemDTO(
                                        id = orderItemId,
                                        itemId = reqItem.itemId,
                                        name = dbItem[RetailItems.name],
                                        quantity = reqItem.quantity,
                                        unitPrice = price,
                                        discountAmount = discountAmount,
                                        finalPrice = finalPrice
                                    ))
                                }
                                
                                // Update total amount of order
                                RetailOrders.update({ RetailOrders.id eq orderId }) {
                                    it[totalAmount] = grandTotal
                                }
                                
                                OrderDTO(
                                    id = orderId,
                                    clientId = cId,
                                    bankAccountId = req.bankAccountId,
                                    totalAmount = grandTotal,
                                    orderDate = now.toString(),
                                    status = "paid",
                                    items = responseItems
                                )
                            }
                            
                            call.respond(HttpStatusCode.Created, mapOf("message" to "Плащането е успешно. Генерирана сметка/фактура", "invoice" to generatedInvoice))
                        } catch (e: Exception) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("error" to e.message))
                        }
                    }
                }
            }
            
            // --- Statistics API (Admin / Moderator Only) ---
            withRole("admin", "moderator") {
                get("/stats") {
                    val session = call.sessions.get<UserSession>()!!
                    val stats = transaction {
                        // Category Stats
                        val categoryStats = mutableMapOf<String, Pair<Int, Double>>()
                        
                        // Select paid orders
                        val paidOrders = RetailOrders.select { RetailOrders.status eq "paid" }.map { it[RetailOrders.id] }
                        
                        val orderItems = RetailOrderItems.select { RetailOrderItems.orderId inList paidOrders }
                        for (row in orderItems) {
                            val itemId = row[RetailOrderItems.itemId]
                            val qty = row[RetailOrderItems.quantity]
                            val revenue = row[RetailOrderItems.finalPrice]
                            
                            val item = RetailItems.select { RetailItems.id eq itemId }.singleOrNull()
                            val category = item?.get(RetailItems.category) ?: "Неизвестна"
                            
                            val current = categoryStats.getOrDefault(category, Pair(0, 0.0))
                            categoryStats[category] = Pair(current.first + qty, current.second + revenue)
                        }
                        
                        val catStatsList = categoryStats.map { (cat, data) ->
                            CategoryStat(category = cat, totalSold = data.first, totalRevenue = data.second)
                        }
                        
                        if (session.role == "admin") {
                            // Full statistics for Admin
                            val totalRevenue = RetailOrders.select { RetailOrders.status eq "paid" }.sumOf { it[RetailOrders.totalAmount] }
                            val totalOrders = RetailOrders.select { RetailOrders.status eq "paid" }.count().toInt()
                            val totalClients = RetailClients.selectAll().count().toInt()
                            
                            OverallStats(
                                totalRevenue = totalRevenue,
                                totalOrders = totalOrders,
                                totalClients = totalClients,
                                categoryStats = catStatsList
                            )
                        } else {
                            // Moderator sees only category breakdown stats
                            OverallStats(
                                totalRevenue = 0.0,
                                totalOrders = 0,
                                totalClients = 0,
                                categoryStats = catStatsList
                            )
                        }
                    }
                    call.respond(HttpStatusCode.OK, stats)
                }
            }
        }
    }
}
